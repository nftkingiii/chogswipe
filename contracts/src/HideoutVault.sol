// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title HideoutVault (v2)
/// @notice Holds $CHOG for each Chog hideout, and pays hideouts for defending.
///
/// A raid has two on-chain steps:
/// 1. `openRaid`: the raider's vault puts a ticket in escrow (a share of the most the raid could take).
/// 2. On escape, the raider settles the result signed by the Chogswipe referee: the ticket comes back,
///    the loot moves from the target's vault, and a small cut of it goes to every staked player vault.
///    If the raider is caught (or never settles), anyone can hand the ticket to the defender once the
///    raid window closes.
///
/// Player vaults earn the stakers' cut in proportion to their balance; `claimRewards` adds it to the
/// vault, where it keeps earning. House hideouts (ids >= HOUSE_BASE) are run by the treasury and earn none.
contract HideoutVault is Ownable2Step, Pausable, EIP712 {
    using SafeERC20 for IERC20;

    /// Vault ids at or above this are house hideouts funded by the treasury.
    uint256 public constant HOUSE_BASE = 1_000_000;
    uint16 public constant MAX_CAP_BPS = 2_500; // a raid can never take more than 25%
    uint16 public constant MAX_TICKET_BPS = 5_000; // a ticket is at most half of what the raid could take
    uint16 public constant MAX_FEE_BPS = 2_000; // stakers' cut is at most 20% of the loot
    uint64 public constant MAX_SHIELD = 2 days;
    uint64 public constant MAX_WITHDRAW_DELAY = 1 days;
    uint64 public constant MIN_RAID_WINDOW = 5 minutes;
    uint64 public constant MAX_RAID_WINDOW = 1 days;
    uint256 private constant PRECISION = 1e24; // reward math uses 512-bit mulDiv, so this never overflows

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

    struct Escrow {
        address raider;
        uint64 expiresAt;
        uint256 raiderToken;
        uint256 targetToken;
        uint256 ticket;
    }

    IERC721 public immutable chog;
    IERC20 public immutable chogToken;

    address public referee;
    uint16 public capBps;
    uint256 public minStake;
    uint64 public withdrawDelay;
    /// ticket = target balance x capBps x ticketBps
    uint16 public ticketBps;
    /// stakers' cut of every successful raid
    uint16 public feeBps;
    /// how long a raider has to settle an escape before the ticket goes to the defender
    uint64 public raidWindow;

    mapping(uint256 => uint256) public balanceOf;
    mapping(uint256 => uint64) public shieldUntil;
    mapping(uint256 => PendingWithdrawal) public pendingWithdrawal;
    /// a raid id is used once: settled, or its ticket paid out
    mapping(bytes32 => bool) public settled;
    mapping(bytes32 => Escrow) public escrows;

    // staking rewards (player vaults only)
    uint256 public totalStaked;
    uint256 public accRewardPerShare;
    /// stakers' cut that arrived while nothing was staked; paid out with the next cut
    uint256 public undistributed;
    mapping(uint256 => uint256) public rewardDebt;
    mapping(uint256 => uint256) public rewardOwed;

    event Deposited(uint256 indexed vaultId, address indexed from, uint256 amount);
    event WithdrawRequested(uint256 indexed vaultId, uint256 amount, uint64 readyAt);
    event Withdrawn(uint256 indexed vaultId, address indexed to, uint256 amount);
    event RaidOpened(bytes32 indexed raidId, uint256 indexed raiderToken, uint256 indexed targetToken, uint256 ticket, uint64 expiresAt);
    event Raided(
        bytes32 indexed raidId,
        uint256 indexed raiderToken,
        uint256 indexed targetToken,
        address raider,
        uint256 amount,
        uint256 stakersCut,
        uint64 shieldUntil
    );
    event TicketPaid(bytes32 indexed raidId, uint256 indexed raiderToken, uint256 indexed targetToken, uint256 ticket);
    event RewardsClaimed(uint256 indexed vaultId, uint256 amount);
    event RefereeChanged(address referee);
    event ParamsChanged(uint16 capBps, uint256 minStake, uint64 withdrawDelay);
    event EconomyChanged(uint16 ticketBps, uint16 feeBps, uint64 raidWindow);

    error NotVaultOwner();
    error InvalidParams();
    error NothingPending();
    error NotReady();
    error AlreadySettled();
    error AlreadyOpen();
    error NotOpen();
    error Expired();
    error StillOpen();
    error BadSignature();
    error WrongRaider();
    error RaidMismatch();
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
        uint64 withdrawDelay_,
        uint16 ticketBps_,
        uint16 feeBps_,
        uint64 raidWindow_
    ) Ownable(msg.sender) EIP712("Chogswipe", "2") {
        chog = chog_;
        chogToken = chogToken_;
        _setReferee(referee_);
        _setParams(capBps_, minStake_, withdrawDelay_);
        _setEconomy(ticketBps_, feeBps_, raidWindow_);
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
        _setBalance(vaultId, balanceOf[vaultId] + amount);
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
        uint256 bal = balanceOf[vaultId];
        uint256 amount = p.amount < bal ? p.amount : bal;
        _setBalance(vaultId, bal - amount);
        chogToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(vaultId, msg.sender, amount);
    }

    // ---------------------------------------------------------------- rewards

    /// @notice Stakers' cut earned by a player vault and not yet claimed.
    function pendingRewards(uint256 vaultId) public view returns (uint256) {
        if (vaultId >= HOUSE_BASE) return 0;
        return rewardOwed[vaultId] + Math.mulDiv(balanceOf[vaultId], accRewardPerShare, PRECISION) - rewardDebt[vaultId];
    }

    /// @notice Add a vault's earned rewards to its balance, where they keep earning.
    function claimRewards(uint256 vaultId) external onlyVaultOwner(vaultId) returns (uint256 amount) {
        _accrue(vaultId);
        amount = rewardOwed[vaultId];
        if (amount == 0) return 0;
        rewardOwed[vaultId] = 0;
        // _setBalance accrues again: a no-op now, then resets the debt for the new balance
        _setBalance(vaultId, balanceOf[vaultId] + amount);
        emit RewardsClaimed(vaultId, amount);
    }

    // ------------------------------------------------------------------ raids

    /// @notice The ticket a raid on this target costs right now.
    function ticketFor(uint256 targetToken) public view returns (uint256) {
        return (balanceOf[targetToken] * capBps * ticketBps) / 100_000_000;
    }

    /// @notice Start a raid: the raider's vault puts the ticket in escrow. Sent by the raider before playing.
    function openRaid(bytes32 raidId, uint256 raiderToken, uint256 targetToken) external whenNotPaused {
        if (settled[raidId]) revert AlreadySettled();
        if (escrows[raidId].raider != address(0)) revert AlreadyOpen();
        if (raiderToken >= HOUSE_BASE) revert HouseCannotRaid();
        if (raiderToken == targetToken) revert SelfRaid();
        if (chog.ownerOf(raiderToken) != msg.sender) revert WrongRaider();
        if (block.timestamp < shieldUntil[targetToken]) revert Shielded();
        uint256 bal = balanceOf[raiderToken];
        uint256 ticket = ticketFor(targetToken);
        if (bal < minStake || bal < ticket) revert StakeTooLow();

        _setBalance(raiderToken, bal - ticket);
        uint64 expiresAt = uint64(block.timestamp) + raidWindow;
        escrows[raidId] = Escrow(msg.sender, expiresAt, raiderToken, targetToken, ticket);
        emit RaidOpened(raidId, raiderToken, targetToken, ticket, expiresAt);
    }

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

    /// @notice Settle an escape signed by the referee. Submitted by the raider, who must still hold the
    /// raiding Chog, before the raid window closes. The ticket comes back with the loot, less the stakers' cut.
    function settleRaid(RaidResult calldata r, bytes calldata signature) external whenNotPaused {
        if (settled[r.raidId]) revert AlreadySettled();
        Escrow memory e = escrows[r.raidId];
        if (e.raider == address(0)) revert NotOpen();
        if (block.timestamp > r.deadline || block.timestamp > e.expiresAt) revert Expired();
        if (ECDSA.recover(hashResult(r), signature) != referee) revert BadSignature();
        if (e.raiderToken != r.raiderToken || e.targetToken != r.targetToken || e.raider != r.raider) revert RaidMismatch();
        if (msg.sender != r.raider || chog.ownerOf(r.raiderToken) != r.raider) revert WrongRaider();
        if (r.amount * 10_000 > balanceOf[r.targetToken] * capBps) revert OverCap();
        if (r.shieldSecs > MAX_SHIELD) revert ShieldTooLong();

        settled[r.raidId] = true;
        delete escrows[r.raidId];
        uint256 cut = (r.amount * feeBps) / 10_000;
        _setBalance(r.targetToken, balanceOf[r.targetToken] - r.amount);
        _setBalance(r.raiderToken, balanceOf[r.raiderToken] + e.ticket + r.amount - cut);
        _distribute(cut);
        uint64 until = uint64(block.timestamp) + r.shieldSecs;
        shieldUntil[r.targetToken] = until;
        emit Raided(r.raidId, r.raiderToken, r.targetToken, r.raider, r.amount, cut, until);
    }

    /// @notice After the raid window, a raid that wasn't settled as an escape pays its ticket to the
    /// defender. Anyone can send this; the defender's app does it for them.
    function payTicket(bytes32 raidId) public returns (bool) {
        Escrow memory e = escrows[raidId];
        if (e.raider == address(0)) return false;
        if (block.timestamp <= e.expiresAt) return false;
        settled[raidId] = true;
        delete escrows[raidId];
        _setBalance(e.targetToken, balanceOf[e.targetToken] + e.ticket);
        emit TicketPaid(raidId, e.raiderToken, e.targetToken, e.ticket);
        return true;
    }

    /// @notice Pay out several tickets at once; ids that aren't due are skipped.
    function payTickets(bytes32[] calldata raidIds) external returns (uint256 paid) {
        for (uint256 i; i < raidIds.length; i++) if (payTicket(raidIds[i])) paid++;
    }

    // ------------------------------------------------------------------ admin

    function setReferee(address referee_) external onlyOwner {
        _setReferee(referee_);
    }

    function setParams(uint16 capBps_, uint256 minStake_, uint64 withdrawDelay_) external onlyOwner {
        _setParams(capBps_, minStake_, withdrawDelay_);
    }

    function setEconomy(uint16 ticketBps_, uint16 feeBps_, uint64 raidWindow_) external onlyOwner {
        _setEconomy(ticketBps_, feeBps_, raidWindow_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // -------------------------------------------------------------- internals

    /// Every balance change goes through here, so each player vault's share of the stakers' cut stays exact.
    function _setBalance(uint256 vaultId, uint256 newBalance) internal {
        if (vaultId < HOUSE_BASE) {
            _accrue(vaultId);
            totalStaked = totalStaked - balanceOf[vaultId] + newBalance;
            rewardDebt[vaultId] = Math.mulDiv(newBalance, accRewardPerShare, PRECISION);
        }
        balanceOf[vaultId] = newBalance;
    }

    function _accrue(uint256 vaultId) internal {
        if (vaultId >= HOUSE_BASE) return;
        uint256 accumulated = Math.mulDiv(balanceOf[vaultId], accRewardPerShare, PRECISION);
        rewardOwed[vaultId] += accumulated - rewardDebt[vaultId];
        rewardDebt[vaultId] = accumulated;
    }

    function _distribute(uint256 amount) internal {
        uint256 total = amount + undistributed;
        if (total == 0) return;
        if (totalStaked == 0) {
            undistributed = total;
            return;
        }
        undistributed = 0;
        accRewardPerShare += Math.mulDiv(total, PRECISION, totalStaked);
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

    function _setEconomy(uint16 ticketBps_, uint16 feeBps_, uint64 raidWindow_) internal {
        if (ticketBps_ > MAX_TICKET_BPS || feeBps_ > MAX_FEE_BPS || raidWindow_ < MIN_RAID_WINDOW || raidWindow_ > MAX_RAID_WINDOW) {
            revert InvalidParams();
        }
        ticketBps = ticketBps_;
        feeBps = feeBps_;
        raidWindow = raidWindow_;
        emit EconomyChanged(ticketBps_, feeBps_, raidWindow_);
    }
}
