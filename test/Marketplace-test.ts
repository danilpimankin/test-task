import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { increase } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";
import { log } from "console";

describe("Marketplace contract", function () {

  let owner: SignerWithAddress, user1: SignerWithAddress, user2: SignerWithAddress, users: SignerWithAddress[];

  let Marketplace, PaymentToken;
  let paymentToken: Contract;
  let platform: Contract; 

  const AUCTION_DURATION = 3 * 24 * 60 * 60
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
  const ARTIST_ROLE = "0x877a78dc988c0ec5f58453b44888a55eb39755c3d5ed8d8ea990912aa3ef29c6"

  beforeEach(async () => {
    [owner, user1, user2, ...users] = await ethers.getSigners();

    //deploy a main contract
    PaymentToken = await ethers.getContractFactory('MyToken');
    paymentToken = await PaymentToken.deploy()

    //deploy a test payment token
    Marketplace = await ethers.getContractFactory('Marketplace');
    platform = await Marketplace.deploy()
  })

  describe("Functionality tests", async () => {
    it("test 1. Normal interaction with the platform through the list item via Ether", async () => {
      await platform.grantRole(ARTIST_ROLE, user1.address)

      await expect(platform.connect(user1).createItem("some URI"))
        .to.emit(platform, "CreateItem")
        .withArgs(user1.address, 0)

      expect(await platform.ownerOf(0))
        .to.be.eq(user1.address)

      let price = ethers.utils.parseEther("100")

      await expect(platform.connect(user1).listItem(0, price, ZERO_ADDRESS))
        .to.emit(platform, "ListItem")
        .withArgs(user1.address, 0, ZERO_ADDRESS, price)

      let listStruct =  await platform._listings(0)

      expect(listStruct[0])
        .to.be.eq(user1.address)
      expect(listStruct[1])
        .to.be.eq(ZERO_ADDRESS)
      expect(listStruct[2])
        .to.be.eq(price)

      let balanceBefore = await user1.getBalance()

      await expect(platform.connect(user2).buyItem(0, {value: price}))
        .to.emit(platform, "BuyItem")
        .withArgs(user2.address, price, 0)

      let balanceAfter = await user1.getBalance()

      expect(await platform.ownerOf(0))
        .to.be.eq(user2.address)
      expect(balanceAfter.sub(balanceBefore))
        .to.be.eq(price)
    })

    it("test 2. Normal interaction with the platform through the auction via Ether", async () => { 
      await platform.grantRole(ARTIST_ROLE, user1.address)

      await expect(platform.connect(user1).createItem("some URI"))
        .to.emit(platform, "CreateItem")
        .withArgs(user1.address, 0)

      expect(await platform.ownerOf(0))
        .be.eq(user1.address)

      let STARTING_PRICE = ethers.utils.parseEther("100")
      let MINIMAL_STEP = ethers.utils.parseEther("10")

      let startTime = await time.latest()

      await expect(platform.connect(user1).listItemOnAuction(0, STARTING_PRICE, MINIMAL_STEP, ZERO_ADDRESS))
        .to.emit(platform, "ListItemOnAuction")
        .withArgs(user1.address, ZERO_ADDRESS, 0, STARTING_PRICE, MINIMAL_STEP, startTime + 1, startTime + AUCTION_DURATION + 1)

      let auctionStruct =  await platform._auctions(0)


      expect(auctionStruct["seller"])
        .to.be.eq(user1.address)
      expect(auctionStruct["tokenAddress"])
        .to.be.eq(ZERO_ADDRESS)
      expect(auctionStruct["winnerRate"])
        .to.be.eq(STARTING_PRICE)
      expect(auctionStruct["step"])
        .to.be.eq(MINIMAL_STEP)      
      expect(auctionStruct["amountBids"])
        .to.be.eq(0)      
      expect(auctionStruct["buyer"])
        .to.be.eq(ZERO_ADDRESS)
      expect(auctionStruct["finishAt"])
        .to.be.eq(startTime + AUCTION_DURATION + 1)
      let NEXT_BID = STARTING_PRICE.add(MINIMAL_STEP)

      await expect(platform.connect(user2).makeBid(0, NEXT_BID, {value: NEXT_BID}))
        .to.emit(platform, "MakeBid")
        .withArgs(user2.address, 0, ethers.utils.parseEther("110"))

      await platform.makeBid(0, NEXT_BID.add(MINIMAL_STEP), {value: NEXT_BID.add(MINIMAL_STEP)})

      await time.increase(AUCTION_DURATION)
      
      await expect(platform.connect(user2).finishAuction(0))
        .to.emit(platform, "FinishAuction")
        .withArgs(owner.address, 0, ethers.utils.parseEther("120"), await time.latest() + 1)
      
    })

    it("test 3. Normal interaction with the platform through the list item via Tokens", async () => {
      await platform.grantRole(ARTIST_ROLE, user1.address)
      await paymentToken.mint(user2.address, ethers.utils.parseEther("1000"))

      await expect(platform.connect(user1).createItem("some URI"))
        .to.emit(platform, "CreateItem")
        .withArgs(user1.address, 0)

      let price = ethers.utils.parseEther("100")

      await expect(platform.connect(user1).listItem(0, price, paymentToken.address))
        .to.emit(platform, "ListItem")
        .withArgs(user1.address, 0, paymentToken.address, price)

      await paymentToken.connect(user2).approve(platform.address, ethers.utils.parseEther("100"))

      await expect(platform.connect(user2).buyItem(0))
        .to.emit(platform, "BuyItem")
        .withArgs(user2.address, price, 0)
    })

    it("test 4. Normal interaction with the platform through the auction via Tokens", async () => {
      await platform.grantRole(ARTIST_ROLE, user1.address)
      await paymentToken.mint(user2.address, ethers.utils.parseEther("1000"))
      await paymentToken.mint(users[4].address, ethers.utils.parseEther("1000"))

      await expect(platform.connect(user1).createItem("some URI"))
        .to.emit(platform, "CreateItem")
        .withArgs(user1.address, 0)

      let STARTING_PRICE = ethers.utils.parseEther("100")
      let MINIMAL_STEP = ethers.utils.parseEther("10")

      let startTime = await time.latest()

      await expect(platform.connect(user1).listItemOnAuction(0, STARTING_PRICE, MINIMAL_STEP, paymentToken.address))
        .to.emit(platform, "ListItemOnAuction")
        .withArgs(user1.address, paymentToken.address, 0, STARTING_PRICE, MINIMAL_STEP, startTime + 1, startTime + AUCTION_DURATION + 1)
        
      let NEXT_BID = STARTING_PRICE.add(MINIMAL_STEP)

      await paymentToken.connect(user2).approve(platform.address, ethers.utils.parseEther("110"))


      await expect(platform.connect(user2).makeBid(0, NEXT_BID))
        .to.emit(platform, "MakeBid")
        .withArgs(user2.address, 0, ethers.utils.parseEther("110"))

      await paymentToken.connect(users[4]).approve(platform.address, ethers.utils.parseEther("120"))

      await platform.connect(users[4]).makeBid(0, ethers.utils.parseEther("120"), {value: ethers.utils.parseEther("120")})

      await time.increase(AUCTION_DURATION)
      
      await expect(platform.connect(user2).finishAuction(0))
        .to.emit(platform, "FinishAuction")
        .withArgs(users[4].address, 0, ethers.utils.parseEther("120"), await time.latest() + 1)
    })

    it("test 5. Normal interaction with the platform with list canceling", async () => {
      await platform.grantRole(ARTIST_ROLE, user1.address)

      await expect(platform.connect(user1).createItem("some URI"))
        .to.emit(platform, "CreateItem")
        .withArgs(user1.address, 0)

      let price = ethers.utils.parseEther("100")

      await expect(platform.connect(user1).listItem(0, price, ZERO_ADDRESS))
        .to.emit(platform, "ListItem")
        .withArgs(user1.address, 0, ZERO_ADDRESS, price)

      let balanceBefore = await user1.getBalance()

      await expect(platform.connect(user1).cancelListing(0))
        .to.emit(platform, "CancelListing")
        .withArgs(user1.address, 0)
    })

    it("test 6. Normal interaction with the platform through the auction via Ether", async () => { 
      await platform.grantRole(ARTIST_ROLE, user1.address)

      await expect(platform.connect(user1).createItem("some URI"))
        .to.emit(platform, "CreateItem")
        .withArgs(user1.address, 0)

      let STARTING_PRICE = ethers.utils.parseEther("100")
      let MINIMAL_STEP = ethers.utils.parseEther("10")


      await platform.connect(user1).listItemOnAuction(0, STARTING_PRICE, MINIMAL_STEP, ZERO_ADDRESS)

      let NEXT_BID = STARTING_PRICE.add(MINIMAL_STEP)

      await platform.connect(user2).makeBid(0, NEXT_BID, {value: NEXT_BID})

      await expect(platform.connect(user1).cancelAuction(0))
        .to.emit(platform, "CancelAuction")
        .withArgs(user1.address, 0, await time.latest() + 1)
    })

    it("test 7. Normal interaction with the platform with auction canceling via Tokens", async () => {
      await platform.grantRole(ARTIST_ROLE, user1.address)
      await paymentToken.mint(user2.address, ethers.utils.parseEther("1000"))
      await paymentToken.mint(users[4].address, ethers.utils.parseEther("1000"))

      await platform.connect(user1).createItem("some URI")

      let STARTING_PRICE = ethers.utils.parseEther("100")
      let MINIMAL_STEP = ethers.utils.parseEther("10")

      await platform.connect(user1).listItemOnAuction(0, STARTING_PRICE, MINIMAL_STEP, paymentToken.address)
        
      let NEXT_BID = STARTING_PRICE.add(MINIMAL_STEP)

      await paymentToken.connect(user2).approve(platform.address, ethers.utils.parseEther("110"))


      await expect(platform.connect(user2).makeBid(0, NEXT_BID))
        .to.emit(platform, "MakeBid")
        .withArgs(user2.address, 0, ethers.utils.parseEther("110"))

      await paymentToken.connect(users[4]).approve(platform.address, ethers.utils.parseEther("120"))

      await platform.connect(users[4]).makeBid(0, ethers.utils.parseEther("120"), {value: ethers.utils.parseEther("120")})

      await expect(platform.connect(user1).cancelAuction(0))
        .to.emit(platform, "CancelAuction")
        .withArgs(user1.address, 0, await time.latest() + 1)
    })
  })

  describe("Balances tests", async () => {
    it("test 1. Check ether balances via listItem", async () => {
      await platform.grantRole(ARTIST_ROLE, user1.address)

      await platform.connect(user1).createItem("some URI")

      let price = ethers.utils.parseEther("100")

      await platform.connect(user1).listItem(0, price, ZERO_ADDRESS)


      await expect(await platform.connect(user2).buyItem(0, {value: price}))
        .to.changeEtherBalances([user1, user2], [price, price.mul(-1)]);
    })

    it("test 2. Check ether balances via listOnAuction", async () => { 
      await platform.grantRole(ARTIST_ROLE, user1.address)

      await platform.connect(user1).createItem("some URI")

      let STARTING_PRICE = ethers.utils.parseEther("100")
      let MINIMAL_STEP = ethers.utils.parseEther("10")


      await platform.connect(user1).listItemOnAuction(0, STARTING_PRICE, MINIMAL_STEP, ZERO_ADDRESS)

      let NEXT_BID = STARTING_PRICE.add(MINIMAL_STEP)

      await expect(await platform.connect(user2).makeBid(0, NEXT_BID, {value: NEXT_BID}))
        .to.changeEtherBalances([platform, user2], [NEXT_BID, NEXT_BID.mul(-1)]);

      await expect(await platform.connect(users[2]).makeBid(0, NEXT_BID.add(MINIMAL_STEP), {value: NEXT_BID.add(MINIMAL_STEP)}))
        .to.changeEtherBalances([platform, user2, users[2]], [MINIMAL_STEP, NEXT_BID,  (NEXT_BID.add(MINIMAL_STEP)).mul(-1)]);

      await time.increase(AUCTION_DURATION)

      await expect(await platform.connect(user1).finishAuction(0))
        .to.changeEtherBalances([platform, user1], [(NEXT_BID.add(MINIMAL_STEP)).mul(-1),  NEXT_BID.add(MINIMAL_STEP)]);
    })
    
    it("test 3. Check token balances via listItem", async () => {
      await platform.grantRole(ARTIST_ROLE, user1.address)
      await paymentToken.mint(user2.address, ethers.utils.parseEther("1000"))

      await platform.connect(user1).createItem("some URI")

      let price = ethers.utils.parseEther("100")

      await platform.connect(user1).listItem(0, price, paymentToken.address)

      await paymentToken.connect(user2).approve(platform.address, ethers.utils.parseEther("100"))
      
      let user1BalancesBefore: BigNumber = await paymentToken.balanceOf(user1.address)
      let user2BalancesBefore: BigNumber = await paymentToken.balanceOf(user2.address)

      await platform.connect(user2).buyItem(0)

      let user1BalancesAfter: BigNumber = await paymentToken.balanceOf(user1.address)
      let user2BalancesAfter: BigNumber = await paymentToken.balanceOf(user2.address)

      expect(user1BalancesAfter.sub(user1BalancesBefore))
        .to.be.eq(price)
      expect(user2BalancesBefore.sub(user2BalancesAfter))
        .to.be.eq(price)
    })

    it("test 4. Check token balances via listOnAuction", async () => {
      await platform.grantRole(ARTIST_ROLE, user1.address)
      await paymentToken.mint(user2.address, ethers.utils.parseEther("1000"))
      await paymentToken.mint(users[2].address, ethers.utils.parseEther("1000"))
      await paymentToken.connect(user2).approve(platform.address, ethers.utils.parseEther("1000"))
      await paymentToken.connect(users[2]).approve(platform.address, ethers.utils.parseEther("1000"))


      await platform.connect(user1).createItem("some URI")

      let STARTING_PRICE = ethers.utils.parseEther("100")
      let MINIMAL_STEP = ethers.utils.parseEther("10")

      await platform.connect(user1).listItemOnAuction(0, STARTING_PRICE, MINIMAL_STEP, paymentToken.address)

      let NEXT_BID = STARTING_PRICE.add(MINIMAL_STEP)

      let user1BalancesBefore: BigNumber = await paymentToken.balanceOf(user2.address)
      await platform.connect(user2).makeBid(0, NEXT_BID, {value: NEXT_BID})
      let user1BalancesAfter: BigNumber = await paymentToken.balanceOf(user2.address)

      expect(user1BalancesBefore.sub(user1BalancesAfter))
        .to.be.eq(NEXT_BID)

      let user2BalancesBefore: BigNumber = await paymentToken.balanceOf(users[2].address)
      await platform.connect(users[2]).makeBid(0, NEXT_BID.add(MINIMAL_STEP), {value: NEXT_BID.add(MINIMAL_STEP)})
      let user1BalancesAfter2: BigNumber = await paymentToken.balanceOf(user2.address)
      let user2BalancesAfter: BigNumber = await paymentToken.balanceOf(users[2].address)

      expect(user1BalancesBefore).to.be.eq(user1BalancesAfter2)

      expect(user2BalancesBefore.sub(user2BalancesAfter))
        .to.be.eq(NEXT_BID.add(MINIMAL_STEP))

      await time.increase(AUCTION_DURATION)
                
      user1BalancesBefore = await paymentToken.balanceOf(user1.address)
      await platform.connect(user1).finishAuction(0)
      user1BalancesAfter = await paymentToken.balanceOf(user1.address)

      expect(user1BalancesAfter.sub(user1BalancesBefore))
        .to.be.eq(NEXT_BID.add(MINIMAL_STEP))

    })

  })

  describe("Other tests", async () => {
    it("test 1. Refund test", async () => {
      await platform.grantRole(ARTIST_ROLE, user1.address)

      await platform.connect(user1).createItem("some URI")

      let price = ethers.utils.parseEther("100")

      await platform.connect(user1).listItem(0, price, ZERO_ADDRESS)


      await expect(await platform.connect(user2).buyItem(0, {value: price.add(ethers.utils.parseEther("10"))}))
        .to.changeEtherBalances([user1, user2], [price, price.mul(-1)]);
    })

    it("test 2. Not enough bidders with Ether", async () => { 
      await platform.grantRole(ARTIST_ROLE, user1.address)

      await platform.connect(user1).createItem("some URI")

      let STARTING_PRICE = ethers.utils.parseEther("100")
      let MINIMAL_STEP = ethers.utils.parseEther("10")


      await platform.connect(user1).listItemOnAuction(0, STARTING_PRICE, MINIMAL_STEP, ZERO_ADDRESS)

      let NEXT_BID = STARTING_PRICE.add(MINIMAL_STEP)

      await expect(await platform.connect(user2).makeBid(0, NEXT_BID, {value: NEXT_BID}))
        .to.changeEtherBalances([platform, user2], [NEXT_BID, NEXT_BID.mul(-1)]);

      await time.increase(AUCTION_DURATION)

      await expect(await platform.connect(user1).finishAuction(0))
        .to.changeEtherBalances([platform, user2], [NEXT_BID.mul(-1),  NEXT_BID]);
    })

    it("test 3. Not enough bidders with Tokens", async () => {
      await platform.grantRole(ARTIST_ROLE, user1.address)
      await paymentToken.mint(user2.address, ethers.utils.parseEther("1000"))
      await paymentToken.mint(users[2].address, ethers.utils.parseEther("1000"))
      await paymentToken.connect(user2).approve(platform.address, ethers.utils.parseEther("1000"))
      await paymentToken.connect(users[2]).approve(platform.address, ethers.utils.parseEther("1000"))


      await platform.connect(user1).createItem("some URI")

      let STARTING_PRICE = ethers.utils.parseEther("100")
      let MINIMAL_STEP = ethers.utils.parseEther("10")

      await platform.connect(user1).listItemOnAuction(0, STARTING_PRICE, MINIMAL_STEP, paymentToken.address)

      let NEXT_BID = STARTING_PRICE.add(MINIMAL_STEP)

      let user2BalancesBefore: BigNumber = await paymentToken.balanceOf(user2.address)
      await platform.connect(user2).makeBid(0, NEXT_BID, {value: NEXT_BID})
      let user2BalancesAfter: BigNumber = await paymentToken.balanceOf(user2.address)

      expect(user2BalancesBefore.sub(user2BalancesAfter))
        .to.be.eq(NEXT_BID)

      await time.increase(AUCTION_DURATION)

      let user1BalancesBefore: BigNumber = await paymentToken.balanceOf(user1.address)
      await platform.connect(user1).finishAuction(0)
      let user1BalancesAfter: BigNumber = await paymentToken.balanceOf(user1.address)
      let userwBalancesAfter2: BigNumber = await paymentToken.balanceOf(user2.address)

      expect(user2BalancesBefore).to.be.eq(userwBalancesAfter2)
      expect(user1BalancesAfter).to.be.eq(user1BalancesBefore)
    })

    it("test 4. Check a current price", async () => { 
      await platform.grantRole(ARTIST_ROLE, user1.address)

      await platform.connect(user1).createItem("some URI")

      let STARTING_PRICE = ethers.utils.parseEther("100")
      let MINIMAL_STEP = ethers.utils.parseEther("10")


      await platform.connect(user1).listItemOnAuction(0, STARTING_PRICE, MINIMAL_STEP, ZERO_ADDRESS)

      let NEXT_BID = STARTING_PRICE.add(MINIMAL_STEP)

      expect(await platform.getItemCurrentAuctionPrice(0))
        .to.be.eq(STARTING_PRICE)

      await platform.connect(user2).makeBid(0, NEXT_BID, {value: NEXT_BID})

      expect(await platform.getItemCurrentAuctionPrice(0))
        .to.be.eq(NEXT_BID)

    })

    it("test 5. Cancel requirement tests", async () => { 
      await expect(platform.cancelAuction(0))
        .to.be.revertedWith("MARKETPLACE: You are not the owner of this auction")
    
      await platform.grantRole(ARTIST_ROLE, user1.address)

      await expect(platform.connect(user1).createItem("some URI"))
        .to.emit(platform, "CreateItem")
        .withArgs(user1.address, 0)

      let STARTING_PRICE = ethers.utils.parseEther("100")
      let MINIMAL_STEP = ethers.utils.parseEther("10")

      await platform.connect(user1).listItemOnAuction(0, STARTING_PRICE, MINIMAL_STEP, ZERO_ADDRESS)

      let NEXT_BID = STARTING_PRICE.add(MINIMAL_STEP)

      await platform.connect(user2).makeBid(0, NEXT_BID, {value: NEXT_BID})
      await time.increase(AUCTION_DURATION)
      await expect(platform.connect(user1).cancelAuction(0))
        .to.be.revertedWith("MARKETPLACE: Auction is already finished")
    })

    it("test 6. Cancel requirement tests 2.0", async () => { 
    
      await platform.grantRole(ARTIST_ROLE, user1.address)

      await platform.connect(user1).createItem("some URI")

      let STARTING_PRICE = ethers.utils.parseEther("100")
      let MINIMAL_STEP = ethers.utils.parseEther("10")

      await platform.connect(user1).listItemOnAuction(0, STARTING_PRICE, MINIMAL_STEP, ZERO_ADDRESS)

      await platform.connect(user1).cancelAuction(0)
  
    })

    it("test 7. Cancel requirement tests 3.0", async () => { 
    
      await platform.grantRole(ARTIST_ROLE, user1.address)

      await platform.connect(user1).createItem("some URI")

      let STARTING_PRICE = ethers.utils.parseEther("100")
      let MINIMAL_STEP = ethers.utils.parseEther("10")

      await platform.connect(user1).listItemOnAuction(0, STARTING_PRICE, MINIMAL_STEP, paymentToken.address)

      await platform.connect(user1).cancelAuction(0)
  
    })
    it("test 8. Finish requirement tests", async () => { 
      await expect(platform.finishAuction(0))
        .to.be.revertedWith("MARKETPLACE: Auction is not active")
    
      await platform.grantRole(ARTIST_ROLE, user1.address)

      await expect(platform.connect(user1).createItem("some URI"))
        .to.emit(platform, "CreateItem")
        .withArgs(user1.address, 0)

      let STARTING_PRICE = ethers.utils.parseEther("100")
      let MINIMAL_STEP = ethers.utils.parseEther("10")


      await platform.connect(user1).listItemOnAuction(0, STARTING_PRICE, MINIMAL_STEP, ZERO_ADDRESS)

      let NEXT_BID = STARTING_PRICE.add(MINIMAL_STEP)

      await platform.connect(user2).makeBid(0, NEXT_BID, {value: NEXT_BID})

      await expect(platform.connect(user1).finishAuction(0))
        .to.be.revertedWith("MARKETPLACE: Auction is not over")
    })

    it("test 9. Make bid equirement tests ", async () => { 
      let STARTING_PRICE = ethers.utils.parseEther("100")
      let MINIMAL_STEP = ethers.utils.parseEther("10")
      let NEXT_BID = STARTING_PRICE.add(MINIMAL_STEP)

      await expect(platform.connect(user2).makeBid(0, NEXT_BID, {value: NEXT_BID}))
        .to.be.revertedWith("MARKETPLACE: Item is not selling")
    

      await platform.grantRole(ARTIST_ROLE, user1.address)

      await platform.connect(user1).createItem("some URI")
      await platform.connect(user1).listItemOnAuction(0, STARTING_PRICE, MINIMAL_STEP, ZERO_ADDRESS)
      await expect(platform.connect(user2).makeBid(0, NEXT_BID, {value: NEXT_BID.sub(10)}))
      .to.be.revertedWith("MARKETPLACE: You have not sent enough funds to make bid")
      await time.increase(AUCTION_DURATION)
      await expect(platform.connect(user2).makeBid(0, NEXT_BID, {value: NEXT_BID}))
        .to.be.revertedWith("MARKETPLACE: Auction is over")
    })

    it("test 10. butItem requirement tests", async () => {
      await platform.grantRole(ARTIST_ROLE, user1.address)

      await platform.connect(user1).createItem("some URI")

      let price = ethers.utils.parseEther("100")
      await expect(platform.connect(user2).listItem(0, price, ZERO_ADDRESS))
        .to.be.revertedWith("MARKETPLACE: You are not an owner")
      await expect(platform.connect(user2).buyItem(0, {value: ethers.utils.parseEther("10")}))
        .to.be.revertedWith("MARKETPLACE: Item is not selling")

      await expect(platform.connect(user1).listItem(0, price, ZERO_ADDRESS))
      await expect(platform.connect(user2).buyItem(0, {value: ethers.utils.parseEther("10")}))
        .to.be.revertedWith("MARKETPLACE: You have not sent enough funds")
    })

  })
})