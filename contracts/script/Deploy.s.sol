// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {HideoutVault} from "../src/HideoutVault.sol";

/// forge script script/Deploy.s.sol --rpc-url monad --broadcast
/// Env: DEPLOYER_PRIVATE_KEY, REFEREE_ADDRESS, and optionally OWNER_ADDRESS (ownership is offered to it;
/// that wallet then calls acceptOwnership).
contract Deploy is Script {
    IERC721 constant CHOG = IERC721(0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763);
    IERC20 constant CHOG_TOKEN = IERC20(0x350035555E10d9AfAF1566AaebfCeD5BA6C27777);

    function run() external returns (HideoutVault vault) {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address referee = vm.envAddress("REFEREE_ADDRESS");
        address newOwner = vm.envOr("OWNER_ADDRESS", address(0));
        vm.startBroadcast(key);
        // raids take at most 10%, 1,000 $CHOG to raid, 1 hour withdrawals,
        // tickets 10% of the most a raid could take, stakers get 5% of every swipe, 30 minute raid window
        vault = new HideoutVault(CHOG, CHOG_TOKEN, referee, 1_000, 1_000 ether, 1 hours, 1_000, 500, 30 minutes);
        if (newOwner != address(0)) vault.transferOwnership(newOwner);
        vm.stopBroadcast();
        console.log("HideoutVault", address(vault));
    }
}
