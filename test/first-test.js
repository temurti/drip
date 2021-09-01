const { web3tx, toWad, wad4human } = require("@decentral.ee/web3-helpers");

const deployFramework = require("@superfluid-finance/ethereum-contracts/scripts/deploy-framework");
const deployTestToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-test-token");
const deploySuperToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-super-token");
const SuperfluidSDK = require("@superfluid-finance/js-sdk");

const erc20Token = artifacts.require("ERC20");
const TradeableFlow = artifacts.require("TradeableFlow.sol");

const traveler = require("ganache-time-traveler");
const { assert } = require("hardhat");
const ONE_DAY = 3600 * 24;
const ONE_HOUR = 3600;
const ONE_MINUTE = 60;
const TO_GWEI = 10**18;


describe("TradeableFlow", function () {

    let accounts;

    before(async function () {
        accounts = await web3.eth.getAccounts();
    });
    
    const errorHandler = (err) => {
        if (err) throw err;
    };

    const names = ["Admin", "Alice", "Bob", "Carol", "Dan", "Emma", "Frank"];
    const tokens = ["fDAI","fUSDC","fTUSD","fFRAX"]

    let sf;
    let dai;
    let daix;
    let app;
    const token_directory = {}  // token => regulartoken, supertoken
    const user_directory = {};  // alias => sf.user
    const alias_directory = {}; // address => alias

    before(async function () {
        //process.env.RESET_SUPERFLUID_FRAMEWORK = 1;
        // Deploy SuperFluid test framework
        await deployFramework(errorHandler, {
            web3,
            from: accounts[0],
        });
    });

    beforeEach(async function () {
        for (var i = 0; i < tokens.length; i++) {
            // Deploy ERC20 token
            await deployTestToken(errorHandler, [":", tokens[i]], {
                web3,
                from: accounts[0],
            });
            // Deploy SuperToken
            await deploySuperToken(errorHandler, [":", tokens[i]], {
                web3,
                from: accounts[0],
            });
        }

        // Deploy and Initialize Superfluid JS SDK framework with fDAI token
        sf = new SuperfluidSDK.Framework({
            web3,
            version: "test",
            tokens: tokens,
        });
        await sf.initialize();

        for (var i = 0; i < tokens.length; i++) {
            
            token_directory[tokens[i]] = {}
            token_directory[tokens[i]]['supertoken'] = sf.tokens[tokens[i]+"x"]
            token_directory[tokens[i]]['regulartoken'] = await sf.contracts.TestToken.at(await sf.tokens[tokens[i]].address)

        }

        // Constructing a user dictionary with the below mapping of aliases to Superfluid user objects
        // Constructing a alias diction with the mapping of addresses to aliases
        for (var i = 0; i < names.length; i++) {
            // user_directory[names[i].toLowerCase()] = sf.user({
            //     address: accounts[i],
            //     token: daix.address,
            // });
            user_directory[names[i].toLowerCase()] = accounts[i];
            // user_directory[names[i].toLowerCase()].alias = names[i];
            alias_directory[user_directory[names[i].toLowerCase()]] = names[i];
            console.log(names[i],"|",accounts[i])

        }

        for (var i = 0; i < tokens.length; i++) {
            // Mint 100000000 regulartokens for each user 
            // Approving reception of supertokens for each user
            for (const [, user] of Object.entries(user_directory)) {
                if (alias_directory[user] === "App") return;
                await web3tx(token_directory[tokens[i]]['regulartoken'].mint, `${alias_directory[user]} mints many ${tokens[i]}`)(
                    user,
                    toWad(100000000),
                    {     
                        from: user,
                    }
                );
                await web3tx(token_directory[tokens[i]]['regulartoken'].approve, `${alias_directory[user]} approves ${tokens[i]}x`)(
                    token_directory[tokens[i]]['supertoken'].address,
                    toWad(100000000),
                    {
                        from: user,
                    }
                );

                checkTokenBalance(user,token_directory[tokens[i]]['regulartoken'])
            }

            console.log(tokens[i]+"x","|",token_directory[tokens[i]]['supertoken'].address);
        }

        //u.zero = { address: ZERO_ADDRESS, alias: "0x0" };
        console.log("Admin:", user_directory.admin);
        console.log("Host:", sf.host.address);
        console.log("CFA:", sf.agreements.cfa.address);

        // Mint "UWL" token
        uwl = await erc20Token.new(
            "Uniwhales",
            "UWL",
            {from:user_directory.alice}
        )
        // await uwl._mint(user_directory.alice.address, 5*10e18)
        console.log("$UWL Address:",uwl.address)
        console.log(`$UWL balance for Alice is ${await uwl.balanceOf(user_directory.alice)}`)

        // Deploy TradeableFlow contract
        app = await TradeableFlow.new(
            user_directory.admin,
            "TradeableFlow",
            "TF",
            sf.host.address,
            sf.agreements.cfa.address,
            // token_directory['fDAI']['supertoken'].address,      // SuperToken accepted by app
            uwl.address,                                        // ERC20Restrict token
            200000000000                                          // Affiliate Portion (20%)
        );

        console.log("TradeableFlow Owner is:", alias_directory[ await app.owner() ] )
        
        // add fUSDCx as an acceptable supertoken
        await app.setNewAcceptedToken(token_directory['fDAI']['supertoken'].address ,{from:user_directory.admin})
        await app.setNewAcceptedToken(token_directory['fUSDC']['supertoken'].address ,{from:user_directory.admin})

        // Create Superfluid user for TradeableFlow contract
        user_directory.app = app.address

        //

    });

    async function checkTokenBalance(user,token) {
        console.log(`$${await token.symbol()} Balance of`, alias_directory[user], "is:", (await token.balanceOf(user)).toString());
    }

    async function checkBalances(accounts,token) {
        for (let i = 0; i < accounts.length; ++i) {
            await checkTokenBalance(accounts[i],token);
        }
    }

    async function upgrade(accounts,supertoken) {
        for (let i = 0; i < accounts.length; ++i) {
            await web3tx(
                supertoken.upgrade,
                `${alias_directory[accounts[i]]} upgrades many ${await supertoken.symbol()}`
            )(toWad(100000000), { from: accounts[i] });
            await checkTokenBalance(accounts[i],supertoken);
        }
    }

    async function logUsers(userList) {
        let header = `USER\t`
        for (let i = 0; i < tokens.length; ++i) {
            header += `|\t${tokens[i]}x\t`
        }
        header += `|\tAFFILIATE`
        console.log(header)
        console.log("--------------------------------------------------------------------------------------")
        for (let i = 0; i < userList.length; i++) {
            row = `${alias_directory[userList[i]]}\t`
            // console.log("Address",userList[i])
            // console.log("Alias",alias_directory[userList[i]])
            for (let j = 0; j < tokens.length; ++j) {
                var tempUser = sf.user({ address: userList[i], token: token_directory[tokens[j]]['supertoken'].address });
                row += `|\t${(await tempUser.details()).cfa.netFlow}\t`
            }
            row += `|\t${alias_directory[( await app.getAffiliateForSubscriber( userList[i] ) )]}`
            console.log(row)
        }
        console.log("--------------------------------------------------------------------------------------")
        bottomline = `App\t`
        for (let i = 0; i < tokens.length; ++i) {
            let tempUser = sf.user({ address: user_directory.app, token: token_directory[tokens[i]]['supertoken'].address });
            bottomline += `|\t${(await tempUser.details()).cfa.netFlow}\t`
        }
        bottomline += "|"
        console.log(bottomline)
        console.log("======================================================================================")
    }

    async function hasFlows(user) {
        const { inFlows, outFlows } = (await user.details()).cfa.flows;
        return inFlows.length + outFlows.length > 0;
    }

    async function appStatus() {
        const isApp = await sf.host.isApp(user_directory.app.address);
        const isJailed = await sf.host.isAppJailed(user_directory.app.address);
        !isApp && console.error("App is not an App");
        isJailed && console.error("app is Jailed");
        // await checkTokenBalance(u.app,daix);
        // await checkOwner();
    }

    async function checkOwner() {
        const owner = await app.getOwner();
        console.log("Contract Owner: ", alias_directory[owner], " = ", owner);
        return owner.toString();
    }

    async function transferNFT(to) {
        const receiver = to.address || to;
        const owner = await checkOwner();
        console.log("got owner from checkOwner(): ", owner);
        console.log("receiver: ", receiver);
        if (receiver === owner) {
            console.log("user === owner");
            return false;
        }
        await app.transferFrom(owner, receiver, 1, { from: owner });
        console.log(
            "token transferred, new owner: ",
            receiver,
            " = ",
            alias_directory[receiver]
        );
        return true;
    }

    // TODO: edge cases 
    //    - starting a stream without initializing any payment tokens
   
    describe("sending flows", async function () {

        let switchBoard = {
            "NFT Testing":false,
            "transferring pre-cashflow NFT":false,
            "subscriber switching payment tokens":false,
            "_updateOutflow w/ 2 aff, 3 subs (increase then decrease)": false,
            "_createOutflow w/ aff, 1 subscribers, NFT transfer": false,
            "_updateOutflow w/ 2 aff, 3 subs (increase then decrease), NFT transfer": false,
            "affiliate being a subscriber as well":false,
            "testing affiliate and owner flow cancelling":false,
            "testing setting acceptable token":true,
            "advanced multi-NFT case":false,
            "restrict owner flow":false
        }

        if (switchBoard["NFT Testing"]) {

            it("Testing Token Requirements", async () => {
                const { alice , bob } = user_directory
                uwl.transfer(bob,10000, {from:alice})
                await checkTokenBalance(bob,uwl)
                
                await app.mint("BlueWhale", {from:bob})
                await app.mint("Orca", {from:bob})
                console.log("NFT Balance of Alice:", (await app.balanceOf(bob)).toString() )
                console.log("URI of NFT:", (await app.tokenURI(1)))

                // TODO: test changing ERC20 restrictions
            });

        }

        if (switchBoard["transferring pre-cashflow NFT"]) {
            it("transferring pre-cashflow NFT", async () => {
                    
            // SET UP
                const { alice , bob , emma , carol , dan , admin } = user_directory
                userList = [alice , bob , emma , carol , dan , admin]

                // Give Bob 10000 $UWL and an affiliate NFT
                await uwl.transfer(bob,10000, {from:alice})
                await app.mint("BlueWhale", {from:bob})

                // Upgrade all of Alice, Carol, and Bob's DAI
                await upgrade([alice,bob,carol],token_directory["fDAI"]["supertoken"])

                // Give App a little DAIx so it doesn't get mad over deposit allowance
                await token_directory["fDAI"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});

                let affiliateCode1 = web3.eth.abi.encodeParameter('string',"BlueWhale");

            // PART 2
                console.log("=== PART 1: Bob transfer affiliate NFT to Carol ===")

                await app.transferFrom(
                    bob, 
                    carol, 
                    1, 
                    {from:bob}
                );

                await logUsers(userList);

            // PART 2
                console.log("=== PART 2: Carol transfer affiliate NFT to Alice ===")

                await app.transferFrom(
                    carol, 
                    alice, 
                    1, 
                    {from:carol}
                );

                await logUsers(userList);

            // PART 3
                console.log("=== PART 3: Bob opens flow into super app with the NFT's affiliate code===")

                await sf.cfa.createFlow({
                    superToken:   token_directory["fDAI"]["supertoken"].address, 
                    sender:       bob,
                    receiver:     user_directory.app,
                    flowRate:     "10000",
                    userData:     affiliateCode1});

                // Bob is the subscriber, should be -10K
                // Alice is the affiliate, should be +2K
                await logUsers(userList);

            })
        }

        if (switchBoard["subscriber switching payment tokens"]) {

            it("subscriber switching payment tokens", async () => {
            // SET UP
                const { alice , bob , carol , admin } = user_directory
                userList = [alice , bob , carol , admin]

                // Mint Alice 10000 $UWL and an affiliate NFT (Alice already has all the $UWL)
                await app.mint("BlueWhale", {from:alice})

                // Upgrade all of Alice and Bob's DAI
                await upgrade([alice,bob,carol],token_directory["fDAI"]["supertoken"]);
                await upgrade([alice,bob,carol],token_directory["fUSDC"]["supertoken"]);

                // Give App a little DAIx so it doesn't get mad over deposit allowance
                await token_directory["fDAI"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});
                await token_directory["fUSDC"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});

                let affiliateUserData1 = web3.eth.abi.encodeParameter('string',"BlueWhale");

                console.log('=== PART 1: Bob opens up a DAI stream to the app with the affiliate code ===')
                
                await sf.cfa.createFlow({
                    superToken:   token_directory["fDAI"]["supertoken"].address, 
                    sender:       bob,
                    receiver:     user_directory.app,
                    flowRate:     "10000",
                    userData:     affiliateUserData1
                });

                await logUsers(userList)

                console.log(`=== PART 2: Bob cancels his DAI stream ===`)

                await sf.cfa.deleteFlow({
                    superToken: token_directory["fDAI"]["supertoken"].address,
                    sender:     bob,
                    receiver:   user_directory.app,
                    by:         bob
                });

                await logUsers(userList)

                console.log(`=== PART 3: Bob opens a USDC stream (with affiliate code) ===`)

                await sf.cfa.createFlow({
                    superToken:   token_directory["fUSDC"]["supertoken"].address, 
                    sender:       bob,
                    receiver:     user_directory.app,
                    flowRate:     "10000",
                    userData:     web3.eth.abi.encodeParameter('string',"BlueWhale")
                });

                await logUsers(userList)

                // console.log(`=== PART 4: Bob opens a DAI stream (with affiliate code) (should error) ===`)

                // await sf.cfa.createFlow({
                //     superToken:   token_directory["fDAI"]["supertoken"].address, 
                //     sender:       bob,
                //     receiver:     user_directory.app,
                //     flowRate:     "10000",
                //     userData:     web3.eth.abi.encodeParameter('string',"BlueWhale")
                // });

                // await logUsers(userList)

                // PART 3
                console.log("=== PART 5: Transfer NFT from Alice to Carol ===")

                // Transfer affiliate NFT to Alice from Carol
                await app.transferFrom(
                    alice, 
                    carol, 
                    1, 
                    {from:alice}
                );

                await logUsers(userList);


            });
        
        }

        if (switchBoard["_updateOutflow w/ 2 aff, 3 subs (increase then decrease)"]) {

            it("Testing _updateOutflow increase/decrease with multiple affiliates and subscribers", async () => {
            // SET UP
                const { alice , bob , emma , carol , dan , admin } = user_directory
                userList = [alice , bob , emma , carol , dan , admin]

                // Mint Bob and Carol 10000 $UWL and an affiliate NFT
                await uwl.transfer(carol,10000, {from:alice})
                await uwl.transfer(dan,10000, {from:alice})

                await app.mint("BlueWhale", {from:carol})
                await app.mint("KillerWhale", {from:dan})

                // Upgrade all of Alice, Carol, and Bob's DAI
                await upgrade([alice,bob,carol,dan,emma],token_directory["fDAI"]["supertoken"])

                // Give App a little DAIx so it doesn't get mad over deposit allowance
                await token_directory["fDAI"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});

                let aliceEncodedUserData = web3.eth.abi.encodeParameter('string',"BlueWhale");
                let bobEncodedUserData = web3.eth.abi.encodeParameter('string',"KillerWhale");
                let emmaEncodedUserData = web3.eth.abi.encodeParameter('string',"KillerWhale");

            // PART 1
                console.log("=== PART 1: Open stream from Alice, Bob, Emma to app with respective affiliate codes ===")

                await sf.cfa.createFlow({
                    superToken:   token_directory["fDAI"]["supertoken"].address, 
                    sender:       alice,
                    receiver:     user_directory.app,
                    flowRate:     "10000",
                    userData:     aliceEncodedUserData
                });

                await sf.cfa.createFlow({
                    superToken:   token_directory["fDAI"]["supertoken"].address, 
                    sender:       bob,
                    receiver:     user_directory.app,
                    flowRate:     "10000",
                    userData:     bobEncodedUserData
                });

                await sf.cfa.createFlow({
                    superToken:   token_directory["fDAI"]["supertoken"].address, 
                    sender:       emma,
                    receiver:     user_directory.app,
                    flowRate:     "10000",
                    userData:     emmaEncodedUserData
                });

                // Check flow results - did affiliate get share?
                await logUsers(userList)

            // PART 2
                console.log("=== PART 2: Increase stream from Alice and Bob to app by 2x ===")

                await sf.cfa.updateFlow({
                    superToken: token_directory["fDAI"]["supertoken"].address,
                    sender: alice,
                    receiver: user_directory.app,
                    flowRate: "20000"
                });

                
                await sf.cfa.updateFlow({
                    superToken: token_directory["fDAI"]["supertoken"].address,
                    sender: bob,
                    receiver: user_directory.app,
                    flowRate: "20000"
                });

                // Check flow results - did affiliate share get increased?
                await logUsers(userList)

            // PART 3
                console.log("=== PART 3: End Alice and Bob's stream (update to zero) ===")

                await sf.cfa.deleteFlow({
                    superToken: token_directory["fDAI"]["supertoken"].address,
                    sender:     alice,
                    receiver:   user_directory.app,
                    by:         alice
                });

                await sf.cfa.deleteFlow({
                    superToken: token_directory["fDAI"]["supertoken"].address,
                    sender:     bob,
                    receiver:   user_directory.app,
                    by:         bob
                });

                // Check flow results - did affiliate share get increased?
                await logUsers(userList)


            });

        }

        if (switchBoard["_createOutflow w/ aff, 1 subscribers, NFT transfer"]) {

            it("Testing _createOutflow with affiliation, 1 subscribers, NFT transfer", async () => {
        // SET UP

            const { alice , bob , carol , admin } = user_directory
            const userList = [ alice , bob , carol , admin ]

            // Mint Bob 10000 $UWL and an affiliate NFT
            await uwl.transfer(bob,10000, {from:alice})
            await checkTokenBalance(bob,uwl)
            await app.mint("BlueWhale", {from:bob})

            // Upgrade all of Alice, Carol, and Bob's DAI
            await upgrade([alice,bob,carol],token_directory["fDAI"]["supertoken"]);

            // Give App a little DAIx so it doesn't get mad over deposit allowance
            await token_directory["fDAI"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});

        // PART 1
            console.log("=== PART 1: Open stream from Alice with Bob's affiliate code 'BlueWhale' ===")

            // Create valid affiliate code
            let aliceEncodedUserData = web3.eth.abi.encodeParameter('string','BlueWhale');

            // Start flow from Alice to App at 0.001 DAI/second
            await sf.cfa.createFlow({
                superToken:   token_directory["fDAI"]["supertoken"].address, 
                sender:       alice,
                receiver:     user_directory.app,
                flowRate:     "10000",
                userData:     aliceEncodedUserData});

            await logUsers(userList);
        
        // PART 2
            console.log("=== PART 2: Bob transfer affiliate NFT to Carol ===")

            // Transfer affiliate NFT to Carol from Bob
            await app.transferFrom(
                bob, 
                carol, 
                1, 
                {from:bob}
            );

            await logUsers(userList);

        // PART 3
            console.log("=== PART 3: Pass it back to Bob ===")

            // Transfer affiliate NFT to Bob from Carol
            await app.transferFrom(
                carol, 
                bob, 
                1, 
                {from:carol}
            );

            await logUsers(userList);

            });


        }

        if (switchBoard["_updateOutflow w/ 2 aff, 3 subs (increase then decrease), NFT transfer"]) {

            it("Testing _updateOutflow increase/decrease with multiple affiliates and subscribers and then an NFT transfer", async () => {
            // SET UP
                const { alice , bob , emma , carol , dan , admin } = user_directory
                userList = [alice , bob , emma , carol , dan , admin]
                const rate = 0.0000001

                // Mint Bob and Carol 10000 $UWL and an affiliate NFT
                await uwl.transfer(carol,10000, {from:alice})
                await uwl.transfer(dan,10000, {from:alice})
                await checkTokenBalance(carol,uwl)
                await checkTokenBalance(dan,uwl)
                await app.mint("BlueWhale", {from:carol})
                await app.mint("KillerWhale", {from:dan})

                // Upgrade all of Alice, Carol, and Bob's DAI
                await upgrade([alice,bob,carol,dan,emma],token_directory["fDAI"]["supertoken"]);

                // Give App a little DAIx so it doesn't get mad over deposit allowance
                await token_directory["fDAI"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});

                let aliceEncodedUserData = web3.eth.abi.encodeParameter('string',"BlueWhale");
                let bobEncodedUserData = web3.eth.abi.encodeParameter('string',"KillerWhale");
                let emmaEncodedUserData = web3.eth.abi.encodeParameter('string',"KillerWhale");

            // PART 1
                console.log("=== PART 1: Open stream from Alice, Bob, Emma to app with respective affiliate codes ===")

                await sf.cfa.createFlow({
                    superToken:   token_directory["fDAI"]["supertoken"].address, 
                    sender:       alice,
                    receiver:     user_directory.app,
                    flowRate:     "10000",
                    userData:     aliceEncodedUserData
                });

                await sf.cfa.createFlow({
                    superToken:   token_directory["fDAI"]["supertoken"].address, 
                    sender:       bob,
                    receiver:     user_directory.app,
                    flowRate:     "10000",
                    userData:     bobEncodedUserData
                });

                await sf.cfa.createFlow({
                    superToken:   token_directory["fDAI"]["supertoken"].address, 
                    sender:       emma,
                    receiver:     user_directory.app,
                    flowRate:     "10000",
                    userData:     emmaEncodedUserData
                });

                // Check flow results - did affiliate get share?
                await logUsers(userList)

            // PART 2
                console.log("=== PART 2: Increase stream from Alice and Bob to app by 3x ===")

                await sf.cfa.updateFlow({
                    superToken: token_directory["fDAI"]["supertoken"].address,
                    sender: alice,
                    receiver: user_directory.app,
                    flowRate: "30000"
                });

                
                await sf.cfa.updateFlow({
                    superToken: token_directory["fDAI"]["supertoken"].address,
                    sender: bob,
                    receiver: user_directory.app,
                    flowRate: "30000"
                });

                // Check flow results - did affiliate share get increased?
                await logUsers(userList)

            // PART 3
                console.log("=== PART 3: Reduce Alice's stream by 1/2 and end Bob's stream ===")

                await sf.cfa.updateFlow({
                    superToken: token_directory["fDAI"]["supertoken"].address,
                    sender:     alice,
                    receiver:   user_directory.app,
                    flowRate:   "15000"
                });

                await sf.cfa.deleteFlow({
                    superToken: token_directory["fDAI"]["supertoken"].address,
                    sender:     bob,
                    receiver:   user_directory.app,
                    by:         bob
                });

                // Check flow results - did affiliate share get increased?
                await logUsers(userList)

            // PART 4
                console.log("=== PART 4: Dan transfer affiliate NFT to Carol ===")

                // Transfer affiliate NFT to Bob from Carol
                await app.transferFrom(
                    dan, 
                    carol, 
                    2, 
                    {from:dan}
                );

                await logUsers(userList);

            // PART 5
                console.log("=== PART 5: Emma, one of Dan's previous affiliate subscribers, increases her stream by 2x (should increase Carol's stream now) ===")

                await sf.cfa.updateFlow({
                    superToken: token_directory["fDAI"]["supertoken"].address,
                    sender:     emma,
                    receiver:   user_directory.app,
                    flowRate:   "20000"
                });
                
                // @dev - see console screenshot, there's a createFlow happening where there should be an update. Making netflow non-zero

                // Check flow results - did affiliate get share?
                await logUsers(userList)

            });

        }

        if (switchBoard["affiliate being a subscriber as well"]) {

            it("Testing what happens when an affiliate is also a subscriber", async () => {
            // SET UP
                const { alice , bob , carol , admin } = user_directory
                userList = [alice , bob , carol , admin]

                // Mint Alice 10000 $UWL and an affiliate NFT (Alice already has all the $UWL)
                await app.mint("BlueWhale", {from:alice})

                // Upgrade all of Alice and Bob's DAI
                await upgrade([alice,bob,carol],token_directory["fDAI"]["supertoken"]);
                await upgrade([alice,bob,carol],token_directory["fUSDC"]["supertoken"]);

                // Give App a little DAIx so it doesn't get mad over deposit allowance
                await token_directory["fDAI"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});
                await token_directory["fUSDC"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});

                let aliceEncodedUserData = web3.eth.abi.encodeParameter('string',"BlueWhale");

                // if you're an affiliate, can you refer yourself and get a discount plus the affiliate portion of your stream back? Partly.
                // The app should detect if you are an affiliate. If you are, then the discount gets waived. You're already getting your stream back!
                console.log('=== PART 1: Alice, who is an affiliate, opens up a stream to the app with her own referral code')
                
                await sf.cfa.createFlow({
                    superToken:   token_directory["fDAI"]["supertoken"].address, 
                    sender:       alice,
                    receiver:     user_directory.app,
                    flowRate:     "10000",
                    userData:     aliceEncodedUserData
                });

                // await sf.cfa.createFlow({
                //     superToken:   token_directory["fUSDC"]["supertoken"].address, 
                //     sender:       alice,
                //     receiver:     user_directory.app,
                //     flowRate:     "10000",
                //     userData:     aliceEncodedUserData
                // });

                // Alice should have a netflow of -8000
                await logUsers(userList)

                console.log(`=== PART 2: Bob opens a stream with Alice's referral`)

                // await sf.cfa.createFlow({
                //     superToken:   token_directory["fDAI"]["supertoken"].address, 
                //     sender:       bob,
                //     receiver:     user_directory.app,
                //     flowRate:     "10000",
                //     userData:     aliceEncodedUserData
                // });

                await sf.cfa.createFlow({
                    superToken:   token_directory["fUSDC"]["supertoken"].address, 
                    sender:       bob,
                    receiver:     user_directory.app,
                    flowRate:     "10000",
                    userData:     aliceEncodedUserData
                });

                // Alice should have a netflow of -6000
                await logUsers(userList)

                console.log(`=== PART 3: Alice transfers her affiliate NFT to Bob`)

                await app.transferFrom(
                    alice, 
                    bob, 
                    1, 
                    {from:alice}
                );
    
                // Bob should now have the netflow of -6000
                await logUsers(userList);

                console.log(`=== PART 4: Alice increases her stream by 2x and Bob decreases by (1/2)x`)

                await sf.cfa.updateFlow({
                    superToken: token_directory["fDAI"]["supertoken"].address,
                    sender: alice,
                    receiver: user_directory.app,
                    flowRate: "20000"
                });

                // await sf.cfa.updateFlow({
                //     superToken: token_directory["fDAI"]["supertoken"].address,
                //     sender: bob,
                //     receiver: user_directory.app,
                //     flowRate: "5000"
                // });

                // await sf.cfa.updateFlow({
                //     superToken: token_directory["fUSDC"]["supertoken"].address,
                //     sender: alice,
                //     receiver: user_directory.app,
                //     flowRate: "20000"
                // });

                await sf.cfa.updateFlow({
                    superToken: token_directory["fUSDC"]["supertoken"].address,
                    sender: bob,
                    receiver: user_directory.app,
                    flowRate: "5000"
                });

                // Bob is paying out -5000
                // Bob is receiving 20% of Alice's 20000, so +4000
                // Bob is receiving 20% of his own 5000, so +1000
                // Bob netflow should be zero - he broke even!
                await logUsers(userList);

                console.log(`=== PART 5: Bob cancels his stream`)

                // await sf.cfa.deleteFlow({
                //     superToken: token_directory["fDAI"]["supertoken"].address,
                //     sender:     bob,
                //     receiver:   user_directory.app,
                //     by:         bob
                // });

                await sf.cfa.deleteFlow({
                    superToken: token_directory["fUSDC"]["supertoken"].address,
                    sender:     bob,
                    receiver:   user_directory.app,
                    by:         bob
                });

                await logUsers(userList);

            });
        
        }

        if (switchBoard["testing affiliate and owner flow cancelling"]) {

            it("testing affiliate and owner flow cancelling", async () => {
            // SET UP
                const { alice , bob , carol , admin } = user_directory
                userList = [alice , bob , carol , admin]

                // Mint Alice 10000 $UWL and an affiliate NFT (Alice already has all the $UWL)
                await app.mint("BlueWhale", {from:alice})

                // Upgrade all of Alice and Bob's DAI
                await upgrade([alice,bob,carol],token_directory["fDAI"]["supertoken"]);
                await upgrade([alice,bob,carol],token_directory["fUSDC"]["supertoken"]);

                // Give App a little DAIx so it doesn't get mad over deposit allowance
                await token_directory["fDAI"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});
                await token_directory["fUSDC"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});

                let affiliateUserData1 = web3.eth.abi.encodeParameter('string',"BlueWhale");

                console.log('=== PART 1: Bob opens up a DAI stream to the app with the affiliate code ===')

                await sf.cfa.createFlow({
                    superToken:   token_directory["fDAI"]["supertoken"].address, 
                    sender:       bob,
                    receiver:     user_directory.app,
                    flowRate:     "10000",
                    userData:     affiliateUserData1
                });

                await logUsers(userList)

                console.log('=== PART 2: Alice cancels her income stream (for some reason she just wanted to fuck with us) ===')

                await sf.cfa.deleteFlow({
                    superToken: token_directory["fDAI"]["supertoken"].address,
                    sender:     user_directory.app,
                    receiver:   alice,
                    by:         alice
                });


                // App loses net zero here
                await logUsers(userList)

                console.log('=== PART 3: Alice transfers away her affiliate NFT to Bob ===')

                await app.transferFrom(
                    alice, 
                    bob, 
                    1, 
                    {from:alice}
                );

                await logUsers(userList)

                console.log('=== PART 4: Now the owner decides to fuck with us and cancels subscription stream! ===')

                await sf.cfa.deleteFlow({
                    superToken: token_directory["fDAI"]["supertoken"].address,
                    sender:     user_directory.app,
                    receiver:   user_directory.admin,
                    by:         user_directory.admin
                });

                await logUsers(userList)

                console.log('=== PART 5: Alice starts a stream with Bob affiliate code ===')

                await sf.cfa.createFlow({
                    superToken:   token_directory["fDAI"]["supertoken"].address, 
                    sender:       alice,
                    receiver:     user_directory.app,
                    flowRate:     "10000",
                    userData:     affiliateUserData1
                });

                await logUsers(userList)


            })
        
        }

        if (switchBoard["testing setting acceptable token"]) {

            it("testing setting acceptable token", async () => {

                // SET UP
                const { alice , bob , carol , admin } = user_directory
                userList = [alice , bob , carol , admin]

                // Mint Alice 10000 $UWL and an affiliate NFT (Alice already has all the $UWL)
                await app.mint("BlueWhale", {from:alice})

                // Upgrade all of Alice and Bob's DAI
                await upgrade([alice,bob,carol,admin],token_directory["fDAI"]["supertoken"]);

                // Give App a little DAIx so it doesn't get mad over deposit allowance
                await token_directory["fDAI"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});

                let affiliateUserData1 = web3.eth.abi.encodeParameter('string',"BlueWhale");

                // console.log('=== PART 1: Testing opening up a DAI stream to the app with the affiliate code without having set an acceptable token (should fail) ===')

                // await sf.cfa.createFlow({
                //     superToken:   token_directory["fDAI"]["supertoken"].address, 
                //     sender:       alice,
                //     receiver:     user_directory.app,
                //     flowRate:     "10000",
                //     userData:     affiliateUserData1});
    
                // await logUsers(userList);
                                
                console.log("=== PART 1: Setting a valid super token (fFRAXx) for payment ===")
                await app.setNewAcceptedToken(token_directory['fFRAX']['supertoken'].address ,{from:user_directory.admin})

                console.log("=== PART 2: Setting regular token (fFRAX) for payment - should error out ===")
                await app.setNewAcceptedToken(token_directory['fFRAX']['regulartoken'].address ,{from:user_directory.admin})


            })

        }

        if (switchBoard["advanced multi-NFT case"]) {

            it("advanced multi-NFT case", async () => {
            // SET UP
                const { alice , bob , emma , carol , dan , admin } = user_directory
                userList = [alice , bob , emma , carol , dan , admin]
                const rate = 0.0000001

            // Mint Bob and Carol 10000 $UWL and an affiliate NFT
                await uwl.transfer(carol,10000, {from:alice})
                await uwl.transfer(dan,10000, {from:alice})
                await checkTokenBalance(carol,uwl)
                await checkTokenBalance(dan,uwl)
                await app.mint("BlueWhale", {from:dan})
                await app.mint("KillerWhale", {from:dan})
                await app.mint("Penguin", {from:dan})

            // Upgrade all of Alice, Carol, and Bob's DAI
                await upgrade([alice,bob,carol,dan,emma],token_directory["fDAI"]["supertoken"]);
                await upgrade([alice,bob,carol,dan,emma],token_directory["fUSDC"]["supertoken"]);

            // Give App a little DAIx so it doesn't get mad over deposit allowance
                await token_directory["fDAI"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});
                await token_directory["fUSDC"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});

                let BlueWhaleData = web3.eth.abi.encodeParameter('string',"BlueWhale");
                let KillerWhaleData = web3.eth.abi.encodeParameter('string',"KillerWhale");
                let PenguinData = web3.eth.abi.encodeParameter('string',"Penguin");

                console.log("=== PART 1: Dan transfers KillerWhale and Penguin NFTs to Carol ===")

                await app.transferFrom(
                    dan, 
                    carol, 
                    2, 
                    {from:dan}
                );

                await app.transferFrom(
                    dan, 
                    carol, 
                    3, 
                    {from:dan}
                );

                await logUsers(userList);


                console.log("=== PART 2: Dan starts a DAI stream with his BlueWhale affiliate NFT ===")

                await sf.cfa.createFlow({
                    superToken:   token_directory["fDAI"]["supertoken"].address, 
                    sender:       dan,
                    receiver:     user_directory.app,
                    flowRate:     "10000",
                    userData:     BlueWhaleData
                });

                await logUsers(userList);

                console.log("=== PART 3: Dan cancels his stream ===")

                await sf.cfa.deleteFlow({
                    superToken: token_directory["fDAI"]["supertoken"].address,
                    sender:     dan,
                    receiver:   user_directory.app,
                    by:         dan
                });

                await logUsers(userList);

                console.log("=== PART 4: Dan starts a USDC stream with the KillerWhale affiliate NFT ===")

                await sf.cfa.createFlow({
                    superToken:   token_directory["fUSDC"]["supertoken"].address, 
                    sender:       dan,
                    receiver:     user_directory.app,
                    flowRate:     "10000",
                    userData:     KillerWhaleData
                });

                await logUsers(userList);

                console.log("=== PART 5: Dan transfers the BlueWhale NFT to Carol ===")

                await app.transferFrom(
                    dan, 
                    carol, 
                    1, 
                    {from:dan}
                );

                await logUsers(userList);

                console.log("=== PART 6: Carol starts a DAI stream with her BlueWhale affiliate NFT ===")

                await sf.cfa.createFlow({
                    superToken:   token_directory["fDAI"]["supertoken"].address, 
                    sender:       carol,
                    receiver:     user_directory.app,
                    flowRate:     "10000",
                    userData:     BlueWhaleData
                });

                await logUsers(userList);

                console.log("=== PART 7: Dan halves his stream ===")

                await sf.cfa.updateFlow({
                    superToken: token_directory["fUSDC"]["supertoken"].address,
                    sender: dan,
                    receiver: user_directory.app,
                    flowRate: "5000"
                });

                await logUsers(userList);

                console.log("=== PART 7: All NFTs transferred to Emma ===")

                await app.transferFrom(
                    carol, 
                    emma, 
                    1, 
                    {from:carol}
                );


                await app.transferFrom(
                    carol, 
                    emma, 
                    2, 
                    {from:carol}
                );

                await app.transferFrom(
                    carol, 
                    emma, 
                    3, 
                    {from:carol}
                );

                await logUsers(userList);                

                console.log("=== PART 8: Alice starts a USDC stream with Penguin affiliate NFT ===")

                await sf.cfa.createFlow({
                    superToken:   token_directory["fUSDC"]["supertoken"].address, 
                    sender:       alice,
                    receiver:     user_directory.app,
                    flowRate:     "10000",
                    userData:     PenguinData
                });

                await logUsers(userList);                

            })

        }

        if (switchBoard["restrict owner flow"]) {

            it("restrict owner flow", async () => {
            // SET UP
                const { alice , bob , carol , admin } = user_directory
                userList = [alice , bob , carol , admin]

                // Mint Alice 10000 $UWL and an affiliate NFT (Alice already has all the $UWL)
                await app.mint("BlueWhale", {from:alice})

                // Upgrade all of Alice and Bob's DAI
                await upgrade([alice,bob,carol,admin],token_directory["fDAI"]["supertoken"]);
                await upgrade([alice,bob,carol,admin],token_directory["fUSDC"]["supertoken"]);

                // Give App a little DAIx so it doesn't get mad over deposit allowance
                await token_directory["fDAI"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});
                await token_directory["fUSDC"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});

                let affiliateUserData1 = web3.eth.abi.encodeParameter('string',"BlueWhale");

                console.log('=== PART 1: Owner opens up a DAI stream to the app with the affiliate code (should fail) ===')
                
                await sf.cfa.createFlow({
                    superToken:   token_directory["fDAI"]["supertoken"].address, 
                    sender:       admin,
                    receiver:     user_directory.app,
                    flowRate:     "10000",
                    userData:     affiliateUserData1});
    
                await logUsers(userList);

            })
        }

    });
});