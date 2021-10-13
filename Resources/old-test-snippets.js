"_createOutflow no aff":false,
"_createOutflow w/ aff, 2 subscribers":false,
"_updateOutflow no aff (increase)":false,
"_updateOutflow no aff (decrease)": false,
"_updateOutflow w/ aff (increase then decrease)": false,


if (switchBoard["_createOutflow no aff"]) {

    it("Testing _createOutflow no affiliation", async () => {
    // SET UP

        const { alice , bob, admin } = user_directory
        const userList = [alice , bob, admin]
        const rate = 0.0000001

        // Mint Bob 10000 $UWL and an affiliate NFT
        uwl.transfer(bob,10000, {from:alice})
        await checkTokenBalance(bob,uwl)
        await app.mint("BlueWhale", {from:bob})

        // Upgrade all of Alice and Bob's DAI
        await upgrade([alice,bob],token_directory["fDAI"]["supertoken"]);
        await upgrade([alice,bob],token_directory["fUSDC"]["supertoken"]);

    // PART 1: User with no affiliation opens stream to app but with erratic affiliate code

        // Create invalid affiliate code
        let aliceEncodedUserData = web3.eth.abi.encodeParameter('string','PilotWhale');

        // Start flow from Alice to App at 0.001 DAI/second
        await sf.cfa.createFlow({
            superToken:   token_directory["fDAI"]["supertoken"].address, 
            sender:       alice,
            receiver:     user_directory.app,
            flowRate:     "10000",
            userData:     aliceEncodedUserData});

        await logUsers(userList)

    // PART 2: Check that app handles additional flow properly

        // Start flow from Alice to App at 0.001 DAI/second
        await sf.cfa.createFlow({
            superToken:   token_directory["fUSDC"]["supertoken"].address, 
            sender:       bob,
            receiver:     user_directory.app,
            flowRate:     "10000",
            userData:     aliceEncodedUserData});

        await logUsers(userList)

    });

}

if (switchBoard["_createOutflow w/ aff, 2 subscribers"]) {

    it("Testing _createOutflow with affiliation", async () => {
// SET UP

    const { alice , bob , carol , admin } = user_directory
    const userList = [ alice , bob , carol , admin ]
    const rate = 0.0000001

    // Mint Bob 10000 $UWL and an affiliate NFT
    await uwl.transfer(bob,10000, {from:alice})
    await checkTokenBalance(bob,uwl)
    await app.mint("BlueWhale", {from:bob})

    // Upgrade all of Alice, Carol, and Bob's DAI
    await upgrade([alice,bob,carol],token_directory["fDAI"]["supertoken"]);

    // Give App a little DAIx so it doesn't get mad over deposit allowance
    await token_directory["fDAI"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});

// PART 1: Open stream from Alice with Bob's affiliate code "BlueWhale"
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

    await logUsers(userList)

// PART 2: Open stream from Carol with Bob's affiliate code "BlueWhale"
    console.log("=== PART 2: Open stream from Carol with Bob's affiliate code 'BlueWhale' ===")

    // Create valid affiliate code
    let carolEncodedUserData = web3.eth.abi.encodeParameter('string','BlueWhale');

    // Start flow from Alice to App at 0.001 DAI/second
    await sf.cfa.createFlow({
        superToken:   token_directory["fDAI"]["supertoken"].address, 
        sender:       carol,
        receiver:     user_directory.app,
        flowRate:     "10000",
        userData:     carolEncodedUserData});

    await logUsers(userList)

    });

}

if (switchBoard["_updateOutflow no aff (increase)"]) {

    it("Testing _updateOutflow increase without affiliation", async () => {
    // SET UP
        const { alice , bob , carol , admin } = user_directory
        const userList = [alice , bob , carol , admin]

        // Upgrade all of Alice, Carol, and Bob's DAI
        await upgrade([alice,bob,carol],token_directory["fDAI"]["supertoken"]);

        // Give App a little DAIx so it doesn't get mad over deposit allowance
        await token_directory["fDAI"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});

        let aliceEncodedUserData = web3.eth.abi.encodeParameter('string',"");

    // PART 1
        console.log("=== PART 1: Open stream from Alice to app ===")

        await sf.cfa.createFlow({
            superToken:   token_directory["fDAI"]["supertoken"].address, 
            sender:       alice,
            receiver:     user_directory.app,
            flowRate:     "10000",
            userData:     aliceEncodedUserData
        });

        var tempUser = sf.user({ address: user_directory.admin, token: token_directory["fDAI"]["supertoken"].address });
        console.log( "Netflow Owner" , (await tempUser.details()).cfa.netFlow )

        await logUsers(userList)
        
    // PART 2
        console.log("=== PART 2: Increase stream from Alice to app by 2x ===")

        await sf.cfa.updateFlow({
            superToken: token_directory["fDAI"]["supertoken"].address,
            sender: alice,
            receiver: user_directory.app,
            flowRate: "20000",
            aliceEncodedUserData
        });

        await logUsers(userList)

    });

}

if (switchBoard["_updateOutflow no aff (decrease)"]) {

    it("Testing _updateOutflow decrease without affiliation", async () => {
    // SET UP
        const { alice , bob , carol , admin } = user_directory
        const userList = [ alice , bob , carol , admin ]

        // Upgrade all of Alice, Carol, and Bob's DAI
        await upgrade([alice,bob,carol],token_directory["fDAI"]["supertoken"]);

        // Give App a little DAIx so it doesn't get mad over deposit allowance
        await token_directory["fDAI"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});

        let aliceEncodedUserData = web3.eth.abi.encodeParameter('string',"");

    // PART 1: Open stream from Alice to app
        console.log("=== PART 1: Open stream from Alice to app ===")

        await sf.cfa.createFlow({
            superToken:   token_directory["fDAI"]["supertoken"].address, 
            sender:       alice,
            receiver:     user_directory.app,
            flowRate:     "20000",
            userData:     aliceEncodedUserData
        });

        await logUsers(userList)

    // PART 2: cut stream in half
        console.log("=== PART 2: Decrease stream from Alice to app by 1/2 ===")

        await sf.cfa.updateFlow({
            superToken:   token_directory["fDAI"]["supertoken"].address,
            sender:       alice,
            receiver:     user_directory.app,
            flowRate:     "10000",
            userData:     aliceEncodedUserData
        });

        await logUsers(userList)
    
    });
}

if (switchBoard["_updateOutflow w/ aff (increase then decrease)"]) {

    it("Testing _updateOutflow increase with affiliation", async () => {
    // SET UP
        const { alice , bob , carol , admin } = user_directory
        userList = [alice , bob , carol , admin]

        // Mint Bob 10000 $UWL and an affiliate NFT
        await uwl.transfer(bob,10000, {from:alice})
        await checkTokenBalance(bob,uwl)
        await app.mint("BlueWhale", {from:bob})

        // Upgrade all of Alice, Carol, and Bob's DAI
        await upgrade([alice,bob,carol],token_directory["fDAI"]["supertoken"]);

        // Give App a little DAIx so it doesn't get mad over deposit allowance
        await token_directory["fDAI"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});

        let aliceEncodedUserData = web3.eth.abi.encodeParameter('string',"BlueWhale");

    // PART 1
        console.log("=== PART 1: Open stream from Alice to app with affiliate code ===")

        await sf.cfa.createFlow({
            superToken:   token_directory["fDAI"]["supertoken"].address, 
            sender:       alice,
            receiver:     user_directory.app,
            flowRate:     "10000",
            userData:     aliceEncodedUserData
        });

        // Check flow results - did affiliate get share?
        await logUsers(userList)

    // PART 2
        console.log("=== PART 2: Increase stream from Alice to app by 2x ===")

        await sf.cfa.updateFlow({
            superToken: token_directory["fDAI"]["supertoken"].address,
            sender: alice,
            receiver: user_directory.app,
            flowRate: "20000"
        });

        // Check flow results - did affiliate share get increased?
        await logUsers(userList)

    // PART 3
        console.log("=== PART 3: End Alice's stream (update to zero) ===")

        await sf.cfa.deleteFlow({
            superToken: token_directory["fDAI"]["supertoken"].address,
            sender:     alice,
            receiver:   user_directory.app,
            by:         alice
        });

        // Check flow results - did affiliate share get increased?
        await logUsers(userList)
        
    });
}



///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


if (switchBoard["advanced multi-NFT case"]) {

    it("advanced multi-NFT case", async () => {
    // SET UP
        const { alice , bob , emma , carol , dan , admin } = user_directory
        userList = [alice , bob , emma , carol , dan , admin]
        const rate = 0.0000001

    // Mint Bob and Carol 10000 $UWL and an affiliate NFT
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
        
        console.log("=== PART 7: Emma transfers Penguin NFT to Bob ===")

        await app.transferFrom(
            emma, 
            bob, 
            3, 
            {from:emma}
        );

        await logUsers(userList); 

    })

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
        // await uwl.transfer(carol,10000, {from:alice})
        // await uwl.transfer(dan,10000, {from:alice})

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