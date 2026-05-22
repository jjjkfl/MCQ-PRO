// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CredentialSeal {
    address public owner;
    uint256 public totalSealed;

    struct SealRecord {
        bool exists;
        string resultId;
        uint256 timestamp;
        address sealer;
        bool revoked;
    }

    mapping(bytes32 => SealRecord) private seals;

    event ResultSealed(bytes32 indexed resultHash, string indexed resultId, uint256 timestamp, address sealer);
    event ResultRevoked(bytes32 indexed resultHash, bool revoked);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function sealResult(bytes32 resultHash, string calldata resultId) external {
        require(!seals[resultHash].exists, "Result already sealed");
        
        seals[resultHash] = SealRecord({
            exists: true,
            resultId: resultId,
            timestamp: block.timestamp,
            sealer: msg.sender,
            revoked: false
        });

        totalSealed += 1;

        emit ResultSealed(resultHash, resultId, block.timestamp, msg.sender);
    }

    function verifyResult(bytes32 resultHash) external view returns (
        bool exists,
        string memory resultId,
        uint256 timestamp,
        address sealer,
        bool revoked
    ) {
        SealRecord memory record = seals[resultHash];
        return (
            record.exists,
            record.resultId,
            record.timestamp,
            record.sealer,
            record.revoked
        );
    }

    function revokeResult(bytes32 resultHash) external onlyOwner {
        require(seals[resultHash].exists, "Result not sealed");
        require(!seals[resultHash].revoked, "Already revoked");

        seals[resultHash].revoked = true;

        emit ResultRevoked(resultHash, true);
    }

    function getTotalSealed() external view returns (uint256) {
        return totalSealed;
    }
}
