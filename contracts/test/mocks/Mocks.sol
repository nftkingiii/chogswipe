// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// Stand-ins for Chog Genesis and $CHOG, for local end-to-end runs (anvil) only.
contract LocalChog is ERC721 {
    constructor() ERC721("Chog Genesis", "CHOG") {}

    function mint(address to, uint256 id) external {
        _mint(to, id);
    }
}

contract LocalChogToken is ERC20 {
    constructor() ERC20("Chog", "CHOG") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
