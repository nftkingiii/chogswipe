// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {HideoutVault} from "../src/HideoutVault.sol";

contract MockChog is ERC721 {
    constructor() ERC721("Chog Genesis", "CHOG") {}

    function mint(address to, uint256 id) external {
        _mint(to, id);
    }
}

contract MockChogToken is ERC20 {
    constructor() ERC20("Chog", "CHOG") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract HideoutVaultTest is Test {
    MockChog chog;
    MockChogToken token;
    HideoutVault vault;

    uint256 refereeKey = 0xA11CE;
    address referee;
    address alice = makeAddr("alice"); // raider, owns Chog 1
    address bob = makeAddr("bob"); // defender, owns Chog 2
    address carol = makeAddr("carol");

    uint256 constant ALICE_CHOG = 1;
    uint256 constant BOB_CHOG = 2;
    uint256 constant HOUSE = 1_000_000;
    uint16 constant CAP_BPS = 1_000; // 10%
    uint256 constant MIN_STAKE = 100 ether;
    uint64 constant DELAY = 1 hours;

    function setUp() public {
        referee = vm.addr(refereeKey);
        chog = new MockChog();
        token = new MockChogToken();
        vault = new HideoutVault(chog, token, referee, CAP_BPS, MIN_STAKE, DELAY);

        chog.mint(alice, ALICE_CHOG);
        chog.mint(bob, BOB_CHOG);
        _fund(alice, ALICE_CHOG, 500 ether);
        _fund(bob, BOB_CHOG, 1_000 ether);
        _fund(address(this), HOUSE, 2_000 ether);
    }

    function _fund(address who, uint256 vaultId, uint256 amount) internal {
        token.mint(who, amount);
        vm.startPrank(who);
        token.approve(address(vault), amount);
        vault.deposit(vaultId, amount);
        vm.stopPrank();
    }

    function _result(bytes32 id, uint256 target, uint256 amount)
        internal
        view
        returns (HideoutVault.RaidResult memory)
    {
        return HideoutVault.RaidResult({
            raidId: id,
            raider: alice,
            raiderToken: ALICE_CHOG,
            targetToken: target,
            amount: amount,
            shieldSecs: 4 hours,
            deadline: uint64(block.timestamp + 10 minutes)
        });
    }

    function _sign(HideoutVault.RaidResult memory r, uint256 key) internal view returns (bytes memory) {
        (uint8 v, bytes32 rr, bytes32 s) = vm.sign(key, vault.hashResult(r));
        return abi.encodePacked(rr, s, v);
    }

    function _settle(HideoutVault.RaidResult memory r) internal {
        bytes memory sig = _sign(r, refereeKey);
        vm.prank(r.raider);
        vault.settleRaid(r, sig);
    }

    // ---------------------------------------------------------------- happy

    function test_RaidMovesChogBetweenVaults() public {
        _settle(_result("r1", BOB_CHOG, 100 ether));
        assertEq(vault.balanceOf(BOB_CHOG), 900 ether);
        assertEq(vault.balanceOf(ALICE_CHOG), 600 ether);
        assertEq(vault.shieldUntil(BOB_CHOG), block.timestamp + 4 hours);
        assertTrue(vault.settled("r1"));
        // tokens never left the contract
        assertEq(token.balanceOf(address(vault)), 3_500 ether);
    }

    function test_RaidHouseHideout() public {
        _settle(_result("house", HOUSE, 200 ether));
        assertEq(vault.balanceOf(HOUSE), 1_800 ether);
    }

    function test_WithdrawAfterDelay() public {
        vm.prank(bob);
        vault.requestWithdraw(BOB_CHOG, 300 ether);
        vm.warp(block.timestamp + DELAY);
        vm.prank(bob);
        vault.withdraw(BOB_CHOG);
        assertEq(token.balanceOf(bob), 300 ether);
        assertEq(vault.balanceOf(BOB_CHOG), 700 ether);
    }

    function test_WithdrawPaysWhatIsLeftAfterRaid() public {
        vm.prank(bob);
        vault.requestWithdraw(BOB_CHOG, 1_000 ether);
        _settle(_result("r1", BOB_CHOG, 100 ether)); // raided during the delay
        vm.warp(block.timestamp + DELAY);
        vm.prank(bob);
        vault.withdraw(BOB_CHOG);
        assertEq(token.balanceOf(bob), 900 ether);
        assertEq(vault.balanceOf(BOB_CHOG), 0);
    }

    function test_SoldChogVaultFollowsToken() public {
        vm.prank(bob);
        chog.transferFrom(bob, carol, BOB_CHOG);
        vm.prank(bob);
        vm.expectRevert(HideoutVault.NotVaultOwner.selector);
        vault.requestWithdraw(BOB_CHOG, 1 ether);
        vm.prank(carol);
        vault.requestWithdraw(BOB_CHOG, 1 ether);
    }

    // -------------------------------------------------------------- adverse

    function test_RevertWhen_NonOwnerDeposits() public {
        token.mint(carol, 1 ether);
        vm.startPrank(carol);
        token.approve(address(vault), 1 ether);
        vm.expectRevert(HideoutVault.NotVaultOwner.selector);
        vault.deposit(BOB_CHOG, 1 ether);
        vm.stopPrank();
    }

    function test_RevertWhen_WithdrawTooEarly() public {
        vm.startPrank(bob);
        vault.requestWithdraw(BOB_CHOG, 1 ether);
        vm.expectRevert(HideoutVault.NotReady.selector);
        vault.withdraw(BOB_CHOG);
        vm.stopPrank();
    }

    function test_RevertWhen_ReplayedRaid() public {
        HideoutVault.RaidResult memory r = _result("r1", BOB_CHOG, 50 ether);
        _settle(r);
        vm.warp(block.timestamp + 5 hours);
        r.deadline = uint64(block.timestamp + 1);
        bytes memory sig = _sign(r, refereeKey);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.AlreadySettled.selector);
        vault.settleRaid(r, sig);
    }

    function test_RevertWhen_TargetShielded() public {
        _settle(_result("r1", BOB_CHOG, 50 ether));
        HideoutVault.RaidResult memory r = _result("r2", BOB_CHOG, 50 ether);
        bytes memory sig = _sign(r, refereeKey);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.Shielded.selector);
        vault.settleRaid(r, sig);
    }

    function test_RevertWhen_OverCap() public {
        HideoutVault.RaidResult memory r = _result("r1", BOB_CHOG, 100 ether + 1);
        bytes memory sig = _sign(r, refereeKey);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.OverCap.selector);
        vault.settleRaid(r, sig);
    }

    function test_RevertWhen_WrongSigner() public {
        HideoutVault.RaidResult memory r = _result("r1", BOB_CHOG, 10 ether);
        bytes memory sig = _sign(r, 0xBAD);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.BadSignature.selector);
        vault.settleRaid(r, sig);
    }

    function test_RevertWhen_TamperedAmount() public {
        HideoutVault.RaidResult memory r = _result("r1", BOB_CHOG, 10 ether);
        bytes memory sig = _sign(r, refereeKey);
        r.amount = 90 ether;
        vm.prank(alice);
        vm.expectRevert(HideoutVault.BadSignature.selector);
        vault.settleRaid(r, sig);
    }

    function test_RevertWhen_Expired() public {
        HideoutVault.RaidResult memory r = _result("r1", BOB_CHOG, 10 ether);
        bytes memory sig = _sign(r, refereeKey);
        vm.warp(r.deadline + 1);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.Expired.selector);
        vault.settleRaid(r, sig);
    }

    function test_RevertWhen_RaiderSoldChogMidRaid() public {
        HideoutVault.RaidResult memory r = _result("r1", BOB_CHOG, 10 ether);
        bytes memory sig = _sign(r, refereeKey);
        vm.prank(alice);
        chog.transferFrom(alice, carol, ALICE_CHOG);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.WrongRaider.selector);
        vault.settleRaid(r, sig);
    }

    function test_RevertWhen_SomeoneElseSubmits() public {
        HideoutVault.RaidResult memory r = _result("r1", BOB_CHOG, 10 ether);
        bytes memory sig = _sign(r, refereeKey);
        vm.prank(carol);
        vm.expectRevert(HideoutVault.WrongRaider.selector);
        vault.settleRaid(r, sig);
    }

    function test_RevertWhen_StakeTooLow() public {
        vm.prank(alice);
        vault.requestWithdraw(ALICE_CHOG, 450 ether);
        vm.warp(block.timestamp + DELAY);
        vm.prank(alice);
        vault.withdraw(ALICE_CHOG);
        HideoutVault.RaidResult memory r = _result("r1", BOB_CHOG, 10 ether);
        bytes memory sig = _sign(r, refereeKey);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.StakeTooLow.selector);
        vault.settleRaid(r, sig);
    }

    function test_RevertWhen_SelfRaid() public {
        HideoutVault.RaidResult memory r = _result("r1", ALICE_CHOG, 10 ether);
        bytes memory sig = _sign(r, refereeKey);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.SelfRaid.selector);
        vault.settleRaid(r, sig);
    }

    function test_RevertWhen_ShieldTooLong() public {
        HideoutVault.RaidResult memory r = _result("r1", BOB_CHOG, 10 ether);
        r.shieldSecs = 3 days;
        bytes memory sig = _sign(r, refereeKey);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.ShieldTooLong.selector);
        vault.settleRaid(r, sig);
    }

    function test_RevertWhen_Paused() public {
        vault.pause();
        HideoutVault.RaidResult memory r = _result("r1", BOB_CHOG, 10 ether);
        bytes memory sig = _sign(r, refereeKey);
        vm.prank(alice);
        vm.expectRevert();
        vault.settleRaid(r, sig);
    }

    function test_RevertWhen_CapAboveHardLimit() public {
        vm.expectRevert(HideoutVault.InvalidParams.selector);
        vault.setParams(2_501, MIN_STAKE, DELAY);
    }

    function test_OnlyOwnerAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.setReferee(alice);
    }

    function testFuzz_RaidNeverExceedsCap(uint256 amount) public {
        amount = bound(amount, 0, 1_000 ether);
        HideoutVault.RaidResult memory r = _result("fz", BOB_CHOG, amount);
        bytes memory sig = _sign(r, refereeKey);
        vm.prank(alice);
        if (amount * 10_000 > 1_000 ether * uint256(CAP_BPS)) {
            vm.expectRevert(HideoutVault.OverCap.selector);
            vault.settleRaid(r, sig);
        } else {
            vault.settleRaid(r, sig);
            assertEq(vault.balanceOf(BOB_CHOG), 1_000 ether - amount);
        }
    }
}
