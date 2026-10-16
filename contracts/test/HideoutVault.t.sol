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
    address carol = makeAddr("carol"); // owns Chog 3, a staker who never raids
    address dave = makeAddr("dave"); // a stranger

    uint256 constant ALICE_CHOG = 1;
    uint256 constant BOB_CHOG = 2;
    uint256 constant CAROL_CHOG = 3;
    uint256 constant HOUSE = 1_000_000;
    uint16 constant CAP_BPS = 1_000; // a raid takes at most 10%
    uint256 constant MIN_STAKE = 100 ether;
    uint64 constant DELAY = 1 hours;
    uint16 constant TICKET_BPS = 1_000; // ticket = 10% of the most the raid could take
    uint16 constant FEE_BPS = 500; // stakers get 5% of the loot
    uint64 constant WINDOW = 30 minutes;

    function setUp() public {
        referee = vm.addr(refereeKey);
        chog = new MockChog();
        token = new MockChogToken();
        vault = new HideoutVault(chog, token, referee, CAP_BPS, MIN_STAKE, DELAY, TICKET_BPS, FEE_BPS, WINDOW);

        chog.mint(alice, ALICE_CHOG);
        chog.mint(bob, BOB_CHOG);
        chog.mint(carol, CAROL_CHOG);
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

    function _open(bytes32 id, uint256 target) internal {
        vm.prank(alice);
        vault.openRaid(id, ALICE_CHOG, target);
    }

    function _result(bytes32 id, uint256 target, uint256 amount) internal view returns (HideoutVault.RaidResult memory) {
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

    function _escape(bytes32 id, uint256 target, uint256 amount) internal {
        _open(id, target);
        _settle(_result(id, target, amount));
    }

    /// Every token the vault holds is someone's: a balance, unclaimed rewards, a ticket in escrow,
    /// or a stakers' cut waiting for stakers. Only rounding dust (a few wei) can be left over.
    function _assertConserved(bytes32[] memory openIds) internal view {
        uint256 accounted = vault.balanceOf(ALICE_CHOG) + vault.balanceOf(BOB_CHOG) + vault.balanceOf(CAROL_CHOG) + vault.balanceOf(HOUSE)
            + vault.pendingRewards(ALICE_CHOG) + vault.pendingRewards(BOB_CHOG) + vault.pendingRewards(CAROL_CHOG) + vault.undistributed();
        for (uint256 i; i < openIds.length; i++) {
            (,,,, uint256 ticket) = vault.escrows(openIds[i]);
            accounted += ticket;
        }
        uint256 held = token.balanceOf(address(vault));
        assertGe(held, accounted, "vault owes more than it holds");
        // rounding always favours the vault, by under a wei per 1e24 staked per step
        assertLe(held - accounted, 10 + vault.totalStaked() / 1e22, "more than dust unaccounted for");
    }

    // ---------------------------------------------------------------- escape

    function test_OpenEscrowsTheTicket() public {
        assertEq(vault.ticketFor(BOB_CHOG), 10 ether); // 1,000 x 10% x 10%
        _open("r1", BOB_CHOG);
        assertEq(vault.balanceOf(ALICE_CHOG), 490 ether);
        (address raider, uint64 expiresAt,, uint256 target, uint256 ticket) = vault.escrows("r1");
        assertEq(raider, alice);
        assertEq(target, BOB_CHOG);
        assertEq(ticket, 10 ether);
        assertEq(expiresAt, block.timestamp + WINDOW);
    }

    function test_EscapeReturnsTicketAndPaysLootLessStakersCut() public {
        _escape("r1", BOB_CHOG, 100 ether);
        assertEq(vault.balanceOf(BOB_CHOG), 900 ether);
        assertEq(vault.balanceOf(ALICE_CHOG), 500 ether + 95 ether); // ticket back, loot less 5%
        assertEq(vault.shieldUntil(BOB_CHOG), block.timestamp + 4 hours);
        assertTrue(vault.settled("r1"));
        // the 5 $CHOG cut is shared by stake: alice 595, bob 900 of 1,495
        assertApproxEqAbs(vault.pendingRewards(ALICE_CHOG), uint256(5 ether) * 595 / 1495, 2);
        assertApproxEqAbs(vault.pendingRewards(BOB_CHOG), uint256(5 ether) * 900 / 1495, 2);
        _assertConserved(new bytes32[](0));
    }

    function test_HouseRaidSharesCutWithPlayersOnly() public {
        _escape("h1", HOUSE, 200 ether);
        assertEq(vault.balanceOf(HOUSE), 1_800 ether);
        assertEq(vault.pendingRewards(HOUSE), 0);
        assertEq(vault.totalStaked(), vault.balanceOf(ALICE_CHOG) + vault.balanceOf(BOB_CHOG));
        _assertConserved(new bytes32[](0));
    }

    function test_StakersEarnFromRaidsOnOthers() public {
        _fund(carol, CAROL_CHOG, 1_000 ether);
        _escape("r1", BOB_CHOG, 100 ether); // carol isn't involved
        uint256 carolEarned = vault.pendingRewards(CAROL_CHOG);
        assertApproxEqAbs(carolEarned, uint256(5 ether) * 1_000 / 2_495, 2);
        vm.prank(carol);
        assertEq(vault.claimRewards(CAROL_CHOG), carolEarned);
        assertEq(vault.balanceOf(CAROL_CHOG), 1_000 ether + carolEarned); // compounded
        assertEq(vault.pendingRewards(CAROL_CHOG), 0);
        _assertConserved(new bytes32[](0));
    }

    function test_ClaimedRewardsKeepEarning() public {
        _fund(carol, CAROL_CHOG, 1_000 ether);
        _escape("r1", BOB_CHOG, 100 ether);
        vm.prank(carol);
        vault.claimRewards(CAROL_CHOG);
        uint256 stake = vault.balanceOf(CAROL_CHOG);
        vm.warp(block.timestamp + 5 hours); // bob's shield is over
        _escape("r2", BOB_CHOG, 50 ether);
        assertApproxEqAbs(vault.pendingRewards(CAROL_CHOG), (2.5 ether * stake) / vault.totalStaked(), 2);
        _assertConserved(new bytes32[](0));
    }

    function test_SoldChogTakesItsRewardsAlong() public {
        _fund(carol, CAROL_CHOG, 1_000 ether);
        _escape("r1", BOB_CHOG, 100 ether);
        vm.prank(carol);
        chog.transferFrom(carol, dave, CAROL_CHOG);
        vm.prank(carol);
        vm.expectRevert(HideoutVault.NotVaultOwner.selector);
        vault.claimRewards(CAROL_CHOG);
        vm.prank(dave);
        assertGt(vault.claimRewards(CAROL_CHOG), 0);
    }

    // ---------------------------------------------------------------- caught

    function test_UnsettledRaidPaysTicketToDefender() public {
        _open("r1", BOB_CHOG);
        assertFalse(vault.payTicket("r1")); // not due while the raider can still settle
        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(dave); // anyone can send it
        assertTrue(vault.payTicket("r1"));
        assertEq(vault.balanceOf(BOB_CHOG), 1_010 ether);
        assertEq(vault.balanceOf(ALICE_CHOG), 490 ether);
        assertTrue(vault.settled("r1"));
        assertFalse(vault.payTicket("r1")); // once only
        _assertConserved(new bytes32[](0));
    }

    function test_PayTicketsSkipsWhatIsntDue() public {
        _open("a", BOB_CHOG);
        vm.warp(block.timestamp + WINDOW + 1);
        _open("b", HOUSE); // fresh, not due
        bytes32[] memory ids = new bytes32[](3);
        ids[0] = "a";
        ids[1] = "b";
        ids[2] = "never-opened";
        assertEq(vault.payTickets(ids), 1);
        assertEq(vault.balanceOf(BOB_CHOG), 1_010 ether);
        bytes32[] memory open = new bytes32[](1);
        open[0] = "b";
        _assertConserved(open);
    }

    function test_CaughtThenLateSettleFails() public {
        _open("r1", BOB_CHOG);
        HideoutVault.RaidResult memory r = _result("r1", BOB_CHOG, 50 ether);
        r.deadline = uint64(block.timestamp + 2 hours); // a generous signature can't outlive the raid window
        bytes memory sig = _sign(r, refereeKey);
        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.Expired.selector);
        vault.settleRaid(r, sig);
    }

    // ------------------------------------------------------------- withdraw

    function test_WithdrawAfterDelay() public {
        vm.prank(bob);
        vault.requestWithdraw(BOB_CHOG, 300 ether);
        vm.warp(block.timestamp + DELAY);
        vm.prank(bob);
        vault.withdraw(BOB_CHOG);
        assertEq(token.balanceOf(bob), 300 ether);
        assertEq(vault.balanceOf(BOB_CHOG), 700 ether);
        assertEq(vault.totalStaked(), 1_200 ether);
    }

    function test_WithdrawPaysWhatIsLeftAfterRaid() public {
        vm.prank(bob);
        vault.requestWithdraw(BOB_CHOG, 1_000 ether);
        _escape("r1", BOB_CHOG, 100 ether); // raided during the delay
        vm.warp(block.timestamp + DELAY);
        vm.prank(bob);
        vault.withdraw(BOB_CHOG);
        assertEq(token.balanceOf(bob), 900 ether);
        assertEq(vault.balanceOf(BOB_CHOG), 0);
        assertGt(vault.pendingRewards(BOB_CHOG), 0); // earned while staked, still claimable
        _assertConserved(new bytes32[](0));
    }

    function test_EscrowedTicketCantBeWithdrawn() public {
        vm.prank(alice);
        vault.requestWithdraw(ALICE_CHOG, 500 ether);
        _open("r1", BOB_CHOG);
        vm.warp(block.timestamp + DELAY);
        vm.prank(alice);
        vault.withdraw(ALICE_CHOG);
        assertEq(token.balanceOf(alice), 490 ether); // the 10 in escrow stays for the defender
        assertTrue(vault.payTicket("r1"));
        assertEq(vault.balanceOf(BOB_CHOG), 1_010 ether);
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

    function test_RevertWhen_SettleWithoutOpening() public {
        HideoutVault.RaidResult memory r = _result("r1", BOB_CHOG, 10 ether);
        bytes memory sig = _sign(r, refereeKey);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.NotOpen.selector);
        vault.settleRaid(r, sig);
    }

    function test_RevertWhen_OpenedTwice() public {
        _open("r1", BOB_CHOG);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.AlreadyOpen.selector);
        vault.openRaid("r1", ALICE_CHOG, HOUSE);
    }

    function test_RevertWhen_ResultForAnotherTarget() public {
        _open("r1", HOUSE);
        HideoutVault.RaidResult memory r = _result("r1", BOB_CHOG, 10 ether);
        bytes memory sig = _sign(r, refereeKey);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.RaidMismatch.selector);
        vault.settleRaid(r, sig);
    }

    function test_RevertWhen_ReplayedRaid() public {
        _escape("r1", BOB_CHOG, 50 ether);
        HideoutVault.RaidResult memory r = _result("r1", BOB_CHOG, 50 ether);
        bytes memory sig = _sign(r, refereeKey);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.AlreadySettled.selector);
        vault.settleRaid(r, sig);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.AlreadySettled.selector);
        vault.openRaid("r1", ALICE_CHOG, HOUSE);
    }

    function test_RevertWhen_TargetShielded() public {
        _escape("r1", BOB_CHOG, 50 ether);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.Shielded.selector);
        vault.openRaid("r2", ALICE_CHOG, BOB_CHOG);
    }

    function test_RevertWhen_OverCap() public {
        _open("r1", BOB_CHOG);
        HideoutVault.RaidResult memory r = _result("r1", BOB_CHOG, 100 ether + 1);
        bytes memory sig = _sign(r, refereeKey);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.OverCap.selector);
        vault.settleRaid(r, sig);
    }

    function test_RevertWhen_WrongSigner() public {
        _open("r1", BOB_CHOG);
        HideoutVault.RaidResult memory r = _result("r1", BOB_CHOG, 10 ether);
        bytes memory sig = _sign(r, 0xBAD);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.BadSignature.selector);
        vault.settleRaid(r, sig);
    }

    function test_RevertWhen_TamperedAmount() public {
        _open("r1", BOB_CHOG);
        HideoutVault.RaidResult memory r = _result("r1", BOB_CHOG, 10 ether);
        bytes memory sig = _sign(r, refereeKey);
        r.amount = 90 ether;
        vm.prank(alice);
        vm.expectRevert(HideoutVault.BadSignature.selector);
        vault.settleRaid(r, sig);
    }

    function test_RevertWhen_SignatureExpired() public {
        _open("r1", BOB_CHOG);
        HideoutVault.RaidResult memory r = _result("r1", BOB_CHOG, 10 ether);
        bytes memory sig = _sign(r, refereeKey);
        vm.warp(r.deadline + 1);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.Expired.selector);
        vault.settleRaid(r, sig);
    }

    function test_RevertWhen_RaiderSoldChogMidRaid() public {
        _open("r1", BOB_CHOG);
        HideoutVault.RaidResult memory r = _result("r1", BOB_CHOG, 10 ether);
        bytes memory sig = _sign(r, refereeKey);
        vm.prank(alice);
        chog.transferFrom(alice, carol, ALICE_CHOG);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.WrongRaider.selector);
        vault.settleRaid(r, sig);
    }

    function test_RevertWhen_SomeoneElseSubmits() public {
        _open("r1", BOB_CHOG);
        HideoutVault.RaidResult memory r = _result("r1", BOB_CHOG, 10 ether);
        bytes memory sig = _sign(r, refereeKey);
        vm.prank(carol);
        vm.expectRevert(HideoutVault.WrongRaider.selector);
        vault.settleRaid(r, sig);
    }

    function test_RevertWhen_SomeoneElseOpensForYourChog() public {
        vm.prank(carol);
        vm.expectRevert(HideoutVault.WrongRaider.selector);
        vault.openRaid("r1", ALICE_CHOG, BOB_CHOG);
    }

    function test_RevertWhen_StakeTooLow() public {
        vm.prank(alice);
        vault.requestWithdraw(ALICE_CHOG, 450 ether);
        vm.warp(block.timestamp + DELAY);
        vm.prank(alice);
        vault.withdraw(ALICE_CHOG);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.StakeTooLow.selector);
        vault.openRaid("r1", ALICE_CHOG, BOB_CHOG);
    }

    function test_RevertWhen_SelfRaid() public {
        vm.prank(alice);
        vm.expectRevert(HideoutVault.SelfRaid.selector);
        vault.openRaid("r1", ALICE_CHOG, ALICE_CHOG);
    }

    function test_RevertWhen_HouseRaids() public {
        vm.expectRevert(HideoutVault.HouseCannotRaid.selector);
        vault.openRaid("r1", HOUSE, BOB_CHOG);
    }

    function test_RevertWhen_ShieldTooLong() public {
        _open("r1", BOB_CHOG);
        HideoutVault.RaidResult memory r = _result("r1", BOB_CHOG, 10 ether);
        r.shieldSecs = 3 days;
        bytes memory sig = _sign(r, refereeKey);
        vm.prank(alice);
        vm.expectRevert(HideoutVault.ShieldTooLong.selector);
        vault.settleRaid(r, sig);
    }

    function test_RevertWhen_Paused() public {
        vault.pause();
        vm.prank(alice);
        vm.expectRevert();
        vault.openRaid("r1", ALICE_CHOG, BOB_CHOG);
    }

    function test_TicketsStillPayWhilePaused() public {
        _open("r1", BOB_CHOG);
        vault.pause();
        vm.warp(block.timestamp + WINDOW + 1);
        assertTrue(vault.payTicket("r1"));
    }

    function test_RevertWhen_ParamsAboveHardLimits() public {
        vm.expectRevert(HideoutVault.InvalidParams.selector);
        vault.setParams(2_501, MIN_STAKE, DELAY);
        vm.expectRevert(HideoutVault.InvalidParams.selector);
        vault.setEconomy(5_001, FEE_BPS, WINDOW);
        vm.expectRevert(HideoutVault.InvalidParams.selector);
        vault.setEconomy(TICKET_BPS, 2_001, WINDOW);
        vm.expectRevert(HideoutVault.InvalidParams.selector);
        vault.setEconomy(TICKET_BPS, FEE_BPS, 1 minutes);
    }

    function test_OnlyOwnerAdmin() public {
        vm.startPrank(alice);
        vm.expectRevert();
        vault.setReferee(alice);
        vm.expectRevert();
        vault.setEconomy(0, 0, WINDOW);
        vm.stopPrank();
    }

    // ----------------------------------------------------------------- fuzz

    function testFuzz_RaidNeverExceedsCap(uint256 amount) public {
        amount = bound(amount, 0, 1_000 ether);
        _open("fz", BOB_CHOG);
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

    function testFuzz_TokensAlwaysAccountedFor(uint96 carolStake, uint256 loot1, uint256 loot2, bool escape2, bool claim) public {
        if (carolStake > 0) _fund(carol, CAROL_CHOG, carolStake);
        loot1 = bound(loot1, 0, 100 ether);
        _escape("a", BOB_CHOG, loot1);
        if (claim && carolStake > 0) {
            vm.prank(carol);
            vault.claimRewards(CAROL_CHOG);
        }
        loot2 = bound(loot2, 0, 200 ether);
        _open("b", HOUSE);
        if (escape2) _settle(_result("b", HOUSE, loot2));
        else {
            vm.warp(block.timestamp + WINDOW + 1);
            vault.payTicket("b");
        }
        vm.prank(alice);
        vault.claimRewards(ALICE_CHOG);
        _assertConserved(new bytes32[](0));
    }
}
