// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title HideoutVault
/// @notice Holds $CHOG for each Chog hideout. A raid moves $CHOG from the
/// target's vault to the raider's vault only with a result signed by the
/// Chogswipe referee, and only within on-chain caps.
contract HideoutVault is Ownable2Step, Pausable, EIP712 {
    using SafeERC20 for IERC20;

    /// Vault ids at or above this are house hideouts funded by the treasury.
    uint256 public constant HOUSE_BASE = 1_000_000;
    uint16 public constant MAX_CAP_BPS = 2_500; // a raid can never take more than 25%
    uint64 public constant MAX_SHIELD = 2 days;
    uint64 public constant MAX_WITHDRAW_DELAY = 1 days;

    bytes32 public constant RESULT_TYPEHASH = keccak256(
        "RaidResult(bytes32 raidId,address raider,uint256 raiderToken,uint256 targetToken,uint256 amount,uint64 shieldSecs,uint64 deadline)"
    );

    struct RaidResult {
        bytes32 raidId;
        address raider;
        uint256 raiderToken;
        uint256 targetToken;
        uint256 amount;
        uint64 shieldSecs;
        uint64 deadline;
    }

    struct PendingWithdrawal {
        uint256 amount;
        uint64 readyAt;
    }

    IERC721 public immutable chog;
    IERC20 public immutable chogToken;

    address public referee;
    uint16 public capBps;
    uint256 public minStake;
    uint64 public withdrawDelay;

    mapping(uint256 => uint256) public balanceOf;
    mapping(uint256 => uint64) public shieldUntil;
    mapping(uint256 => PendingWithdrawal) public pendingWithdrawal;
    mapping(bytes32 => bool) public settled;

    event Deposited(uint256 indexed vaultId, address indexed from, uint256 amount);
    event WithdrawRequested(uint256 indexed vaultId, uint256 amount, uint64 readyAt);
    event Withdrawn(uint256 indexed vaultId, address indexed to, uint256 amount);
    event Raided(
        bytes32 indexed raidId,
        uint256 indexed raiderToken,
        uint256 indexed targetToken,
        address raider,
        uint256 amount,
        uint64 shieldUntil
    );
    event RefereeChanged(address referee);
    event ParamsChanged(uint16 capBps, uint256 minStake, uint64 withdrawDelay);

    error NotVaultOwner();
    error InvalidParams();
    error NothingPending();
    error NotReady();
    error AlreadySettled();
    error Expired();
    error BadSignature();
    error WrongRaider();
    error SelfRaid();
    error HouseCannotRaid();
    error Shielded();
    error StakeTooLow();
    error OverCap();
    error ShieldTooLong();

    constructor(
        IERC721 chog_,
        IERC20 chogToken_,
        address referee_,
        uint16 capBps_,
        uint256 minStake_,
        uint64 withdrawDelay_
    ) Ownable(msg.sender) EIP712("Chogswipe", "1") {
        chog = chog_;
        chogToken = chogToken_;
        _setReferee(referee_);
        _setParams(capBps_, minStake_, withdrawDelay_);
    }

    // ---------------------------------------------------------------- owners

    /// @notice Current controller of a vault: the Chog holder, or the
    /// contract owner for house hideouts.
    function vaultOwner(uint256 vaultId) public view returns (address) {
        return vaultId >= HOUSE_BASE ? owner() : chog.ownerOf(vaultId);
    }

    modifier onlyVaultOwner(uint256 vaultId) {
        if (msg.sender != vaultOwner(vaultId)) revert NotVaultOwner();
        _;
    }

    // ------------------------------------------------------- deposit/withdraw

    function deposit(uint256 vaultId, uint256 amount) external whenNotPaused onlyVaultOwner(vaultId) {
        if (amount == 0) revert InvalidParams();
        balanceOf[vaultId] += amount;
        chogToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(vaultId, msg.sender, amount);
    }

    /// @notice Start a withdrawal. The vault stays raidable until it is
    /// executed, so owners can't dodge a raid by pulling funds instantly.
    function requestWithdraw(uint256 vaultId, uint256 amount) external onlyVaultOwner(vaultId) {
        if (amount == 0) revert InvalidParams();
        uint64 readyAt = uint64(block.timestamp) + withdrawDelay;
        pendingWithdrawal[vaultId] = PendingWithdrawal(amount, readyAt);
        emit WithdrawRequested(vaultId, amount, readyAt);
    }

    /// @notice Execute a matured withdrawal to the vault's current owner.
    /// Pays out the lesser of the requested amount and what is left.
    function withdraw(uint256 vaultId) external onlyVaultOwner(vaultId) {
        PendingWithdrawal memory p = pendingWithdrawal[vaultId];
        if (p.amount == 0) revert NothingPending();
        if (block.timestamp < p.readyAt) revert NotReady();
        delete pendingWithdrawal[vaultId];
        uint256 amount = p.amount < balanceOf[vaultId] ? p.amount : balanceOf[vaultId];
        balanceOf[vaultId] -= amount;
        chogToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(vaultId, msg.sender, amount);
    }

    // ------------------------------------------------------------------ raids

    function hashResult(RaidResult calldata r) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    RESULT_TYPEHASH,
                    r.raidId,
                    r.raider,
                    r.raiderToken,
                    r.targetToken,
                    r.amount,
                    r.shieldSecs,
                    r.deadline
                )
            )
        );
    }

    /// @notice Settle a refereed raid. Submitted by the raider, who must still
    /// hold the raiding Chog.
    function settleRaid(RaidResult calldata r, bytes calldata signature) external whenNotPaused {
        if (settled[r.raidId]) revert AlreadySettled();
        if (block.timestamp > r.deadline) revert Expired();
        if (ECDSA.recover(hashResult(r), signature) != referee) revert BadSignature();
        if (r.raiderToken >= HOUSE_BASE) revert HouseCannotRaid();
        if (r.raiderToken == r.targetToken) revert SelfRaid();
        if (msg.sender != r.raider || chog.ownerOf(r.raiderToken) != r.raider) revert WrongRaider();
        if (block.timestamp < shieldUntil[r.targetToken]) revert Shielded();
        if (balanceOf[r.raiderToken] < minStake) revert StakeTooLow();
        if (r.amount * 10_000 > balanceOf[r.targetToken] * capBps) revert OverCap();
        if (r.shieldSecs > MAX_SHIELD) revert ShieldTooLong();

        settled[r.raidId] = true;
        balanceOf[r.targetToken] -= r.amount;
        balanceOf[r.raiderToken] += r.amount;
        uint64 until = uint64(block.timestamp) + r.shieldSecs;
        shieldUntil[r.targetToken] = until;
        emit Raided(r.raidId, r.raiderToken, r.targetToken, r.raider, r.amount, until);
    }

    // ------------------------------------------------------------------ admin

    function setReferee(address referee_) external onlyOwner {
        _setReferee(referee_);
    }

    function setParams(uint16 capBps_, uint256 minStake_, uint64 withdrawDelay_) external onlyOwner {
        _setParams(capBps_, minStake_, withdrawDelay_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _setReferee(address referee_) internal {
        if (referee_ == address(0)) revert InvalidParams();
        referee = referee_;
        emit RefereeChanged(referee_);
    }

    function _setParams(uint16 capBps_, uint256 minStake_, uint64 withdrawDelay_) internal {
        if (capBps_ == 0 || capBps_ > MAX_CAP_BPS || withdrawDelay_ > MAX_WITHDRAW_DELAY) revert InvalidParams();
        capBps = capBps_;
        minStake = minStake_;
        withdrawDelay = withdrawDelay_;
        emit ParamsChanged(capBps_, minStake_, withdrawDelay_);
    }
}
