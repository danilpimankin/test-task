// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./NFTfactory.sol";

/**
* @title NFT marketplace SC 
* @author Danil Pimankin
*/ 
contract Marketplace is NFTfactory, ReentrancyGuard{
    using SafeERC20 for IERC20;

    /**
    * @notice The auction duration in the unix format. 
    */ 
    uint256 public _auctionDuration = 3 days;

    /**
    * @notice The ьinimum number of bids to confirm auction
    */ 
    uint16 public _auctionMinBidders = 2;

    /**
    * @notice List of auction items 
    */ 
    mapping(uint256 => Auction) public _auctions;

    /**
    * @notice List of selling items 
    */ 
    mapping(uint256 => Listing) public _listings;

    struct Auction{
        address seller;
        address buyer;   
        address tokenAddress;
        uint256 step;
        uint256 winnerRate;
        uint256 finishAt;
        uint256 amountBids;
    }

    struct Listing  {
        address owner;
        address tokenAddress;
        uint256 price;
    }
    /**
    * @notice Emitted when a user creates a new token (ERC721 token)
    * @param _creator A token creator address
    * @param _tokenId An ID of the created token
    */
    event CreateItem(
        address indexed _creator, 
        uint256 indexed _tokenId
    );
    /**
    * @notice Emitted when a user starts selling an token (ERC721 token)
    * @param _seller An token seller address
    * @param _tokenId An ID of the selling token
    * @param _tokenAddress An ERC20 Token contract address
    * @param _price price of the selling token
    */
    event ListItem(
        address indexed _seller, 
        uint256 indexed _tokenId, 
        address _tokenAddress, 
        uint256 _price
    );
    /** 
    * @notice Emitted when a user buys an token (ERC721 token)
    * @param _buyer A buyer address
    * @param _tokenId An ID of the bought token
    * @param _price A purchase price
    */
    event BuyItem(
        address indexed _buyer, 
        uint256 indexed _tokenId, 
        uint256 _price
    );    
    /**
    * @notice Emitted when a user cancels the sale of an token (ERC721 token)
    * @param _seller A token owner address
    * @param _tokenId An ID of the token
    */
    event CancelListing(
        address indexed _seller,
        uint256 indexed _tokenId
    );

    /**
    * @notice Emitted when a user lists token on auction  
    * @param _seller A seller address 
    * @param _tokenId An ID of the token   
    * @param _minPrice A starting price of the lot    
    * @param _step A minimum price step
    * @param startAt time of the auction start
    * @param _finishAt time of the auction finish
    */
    event ListItemOnAuction(
        address indexed _seller, 
        address _tokenAddress,
        uint256 indexed _tokenId, 
        uint256 _minPrice, 
        uint256 _step,
        uint256 startAt, 
        uint256 _finishAt
    );

    /**
    * @notice Emitted when a user makes bid to auction
    * @param _bidder A bidder address
    * @param _tokenId An ID of an auction lot   
    * @param _bid A bid value
    */
    event MakeBid(
        address indexed _bidder, 
        uint256 indexed _tokenId, 
        uint256 _bid
    );

    /**
    * @notice Emitted when a user finishes an auction
    * @param _winner A seller address
    * @param _tokenId An ID of the token   
    * @param _totalPrice A total price of a lot
    * @param _finishAt Time when the auction ended    
    */
    event FinishAuction(
        address indexed _winner, 
        uint256 indexed _tokenId, 
        uint256 _totalPrice, 
        uint256 _finishAt
    );

    /** 
    * @notice Emitted when a user finishes an auction
    * @param _seller A seller address
    * @param _tokenId An ID of the token
    * @param _finishAt Time when the auction canceled
    */ 
    event CancelAuction(
        address indexed _seller,
        uint256 indexed _tokenId, 
        uint256 _finishAt
    );

    /**
    * @notice Function to create a token
    * @param uri Token storage URI 
    */
    function createItem(string calldata uri) external returns(uint256 tokenId){
        safeMint(msg.sender, uri); 
        tokenId = totalSupply() - 1;

        emit CreateItem(msg.sender, tokenId);
    } 

    /** 
    * @notice Function to sale a token
    * @param _tokenId An ID of the token 
    * @param _price A token price 
    * @param _tokenAddress Payment token contract address 
    * @dev Transfers `tokenId` from seller address to marketplace adddress.
    * Requirements:
    *   
    * - `_tokenId` must exist.
    * - `_tokenAddress` must take one of two values:
    *    1. Address of the contract for payment with tokens. 
    *    2. Zero address for payment in native currency
    *
    * Emits a {ListItem} event.
    */
    function listItem(
        uint256 _tokenId, 
        uint256 _price, 
        address _tokenAddress
    ) external {
        require(ownerOf(_tokenId) == msg.sender, "MARKETPLACE: You are not an owner");
        Listing storage listing = _listings[_tokenId];

        _transfer(msg.sender, address(this), _tokenId);

        listing.owner = msg.sender;
        listing.tokenAddress = _tokenAddress;
        listing.price = _price;

        emit ListItem(msg.sender, _tokenId, _tokenAddress, _price);
    }

    /**
    * @notice Function to buy a token
    * @param _tokenId An ID of the token 
    * @dev If user bought a token transfers `tokenId` from marketplace adddress address to buyer address 
    * and transfers funds to seller address.
    * Requirements:
    *   
    * - `_tokenId` must exist.
    *
    * Emits a {BuyItem} event.
    */
    function buyItem(uint256 _tokenId) external payable nonReentrant() {
        Listing storage listing = _listings[_tokenId];
        require(listing.owner != address(0), "MARKETPLACE: Item is not selling");
        if (listing.tokenAddress == address(0)) {
            require(msg.value >= listing.price, 
                "MARKETPLACE: You have not sent enough funds"
            );
            (bool success, ) = payable(listing.owner).call{value: listing.price}("");
            require(success);
            
            uint256 refund = msg.value - listing.price;
            if(refund > 0) {
                payable(msg.sender).transfer(refund); 
            }

        } else{
            require(IERC20(listing.tokenAddress).balanceOf(msg.sender) >= listing.price, 
                "MARKETPLACE: You have not sent enough tokens"
            );
            IERC20(listing.tokenAddress).safeTransferFrom(msg.sender, listing.owner, listing.price);
        }
        
        _transfer(address(this), msg.sender, _tokenId);
        
        emit BuyItem(msg.sender, listing.price, _tokenId);

        delete _listings[_tokenId];
    }   

    /**
    * @notice Function to stop item selling
    * @param _tokenId An ID of the token 
    * @dev Transfers `tokenId` from marketplace adddress address to seller address. 
    * Requirements:
    *   
    * - `_tokenId` must exist.
    * - `msg.sender` should be token owner
    *
    * Emits a {CancelListing} event.
    */
    function cancelListing(uint256 _tokenId) external {
        Listing memory listing = _listings[_tokenId];
        require(listing.owner == msg.sender, "MARKETPLACE: You are not an owner");

        _transfer(address(this), msg.sender, _tokenId);

        emit CancelListing(msg.sender, _tokenId);    

        delete _listings[_tokenId];
    }

    /**
    * @notice Function to list item on the auction 
    * @param _tokenId An ID of the token 
    * @param _price A starting price of the lot 
    * @param _step A minimum price step 
    * @param _tokenAddress Payment token contract address 
    * @dev Transfers `tokenId` from seller address address to seller address marketplace adddress and creates {_auctions} structure via _tokenId 
    * Requirements:
    *   
    * - `_tokenId` must exist.
    * - `msg.sender` should be token owner
    * - `_tokenAddress` must take one of two values:
    *    1. Address of the contract for payment with tokens. 
    *    2. Zero address for payment in native currency
    * 
    * Emits a {ListItemOnAuction} event.
    */
    function listItemOnAuction(
        uint256 _tokenId,
        uint256 _price,
        uint256 _step,
        address _tokenAddress
    ) external {
        require(ownerOf(_tokenId) == msg.sender, "MARKETPLACE: You are not an owner");
        
        Auction storage auction = _auctions[_tokenId];

        _transfer(msg.sender, address(this), _tokenId);

        auction.seller = msg.sender;
        auction.winnerRate = _price;
        auction.step = _step;
        auction.finishAt = block.timestamp + _auctionDuration;
        auction.tokenAddress = _tokenAddress;

        emit ListItemOnAuction(msg.sender, _tokenAddress, _tokenId, _price, _step, block.timestamp, auction.finishAt);
    }
    /**
    * @notice Function to make bid on the auction 
    * @param _tokenId An ID of a lot 
    * @param _bid A bid value
    * @dev Transfers `tokenId` from seller address to seller address marketplace adddress and creates {_auctions} structure via _tokenId 
    * Requirements:
    *   
    * - `_tokenId` must exist.
    * - `msg.value` must be greater than the previous bid or `msg.sender token balance` must be greater than the previous bid
    * - `block.timestamp` must be lower than auction finish time
    *
    * Emits a {MakeBid} event.
    */
    function makeBid(
        uint256 _tokenId, 
        uint256 _bid
    ) external payable nonReentrant(){
        Auction storage auction = _auctions[_tokenId];
        uint256 _nextBid = auction.winnerRate + auction.step;

        require(auction.seller != address(0), "MARKETPLACE: Item is not selling");
        require(block.timestamp < auction.finishAt, "MARKETPLACE: Auction is over");

        if (auction.tokenAddress == address(0)) {
            require(msg.value >= _nextBid, "MARKETPLACE: You have not sent enough funds to make bid");
            if(auction.buyer != address(0)) {
                payable(auction.buyer).transfer(auction.winnerRate); 
            }
        } else{
            require(_bid >= _nextBid, "MARKETPLACE: You have not sent enough tokens to make bid");
            IERC20(auction.tokenAddress).safeTransferFrom(msg.sender, address(this), _bid);
            if(auction.buyer != address(0)) {
                IERC20(auction.tokenAddress).safeTransfer(auction.buyer, auction.winnerRate); 
            }
        }

        auction.winnerRate = _bid;
        auction.amountBids++;
        auction.buyer = msg.sender;

        emit MakeBid(msg.sender, _tokenId, _bid);
    }
    /**
    * @notice Function to finish the auction 
    * @param _tokenId An ID of a lot 
    * @dev Transfers `tokenId` from marketplace adddress to buyer address and transfers funds from marketplace adddress to seller address. 
    * Requirements:
    *   
    * - `_tokenId` must exist.
    * - `block.timestamp` must be greater than auction finish time or equal
    *
    * Emits a {FinishAuction} event.
    */
    function finishAuction(uint256 _tokenId) external nonReentrant() { 
        Auction storage auction = _auctions[_tokenId];
        require(auction.seller != address(0), "MARKETPLACE: Auction is not active");
        require(block.timestamp >= auction.finishAt, "MARKETPLACE: Auction is not over");

        if (auction.tokenAddress == address(0)) { 
            if(auction.amountBids >= _auctionMinBidders) {
                payable(auction.seller).transfer(auction.winnerRate);
                _transfer(address(this), auction.buyer, _tokenId);
            } else {
                payable(auction.buyer).transfer(auction.winnerRate);
                _transfer(address(this), auction.seller, _tokenId);
            }
        } else {
            if(auction.amountBids >= _auctionMinBidders) {
                IERC20(auction.tokenAddress).safeTransfer(auction.seller, auction.winnerRate);
                _transfer(address(this), auction.buyer, _tokenId);
            } else {
                IERC20(auction.tokenAddress).safeTransfer(auction.buyer, auction.winnerRate);
                _transfer(address(this), auction.seller, _tokenId);
            }
        }

        emit FinishAuction(auction.buyer, _tokenId, auction.winnerRate, block.timestamp);

        delete _auctions[_tokenId];
    }
    /**
    * @notice Function to cancel the auction 
    * @param _tokenId An ID of a lot 
    * @dev Transfers `tokenId` from marketplace adddress to seller address and transfers funds from marketplace adddress to buyer address. 
    * Requirements:
    *   
    * - `_tokenId` must exist.
    * - `msg.sender` should be token seller
    * - `block.timestamp` must be lower than auction finish time
    *
    * Emits a {CancelAuction} event.
    */
    function cancelAuction(uint256 _tokenId) external {
        Auction storage auction = _auctions[_tokenId];
        require(auction.seller == msg.sender, "MARKETPLACE: You are not the owner of this auction");
        require(block.timestamp < auction.finishAt, "MARKETPLACE: Auction is already finished");

        if (auction.tokenAddress == address(0)) { 
            if(auction.buyer != address(0)) {
                payable(auction.buyer).transfer(auction.winnerRate);
            }
        }else {
            if(auction.buyer != address(0)) {
                IERC20(auction.tokenAddress).safeTransfer(auction.buyer, auction.winnerRate); 
            }
        }

        _transfer(address(this), auction.seller, _tokenId);

        emit CancelAuction(msg.sender, _tokenId, block.timestamp);
        
        delete _auctions[_tokenId];
    }


    function getItemCurrentAuctionPrice(uint256 _tokenId) external view returns(uint) {
        return _auctions[_tokenId].winnerRate;
    }

}