// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AccessControl {
    address public admin;
    mapping(address => mapping(string => bool)) private userRoles;

    event RoleGranted(address indexed user, string role);
    event RoleRevoked(address indexed user, string role);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function grantRole(address user, string calldata role) external onlyAdmin {
        userRoles[user][role] = true;
        emit RoleGranted(user, role);
    }

    function revokeRole(address user, string calldata role) external onlyAdmin {
        userRoles[user][role] = false;
        emit RoleRevoked(user, role);
    }

    function hasRole(address user, string calldata role) external view returns (bool) {
        return userRoles[user][role];
    }
}
