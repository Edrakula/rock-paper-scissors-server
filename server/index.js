const express = require("express");
const session = require("express-session");
const uuid = require("uuid");
const mysql = require('mysql');
const WebSocket = require("ws");
const http = require("http");

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'nodetest',
});

const PORT = process.env.PORT || 3001;
const app = express();

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Map();
const searchingPlayers = [];
const matchDetailsMap = new Map();

async function handleMatch(player1, player2) {
    // Example: Fetch usernames based on player UUIDs
    const username1 = await getUsernameFromUUID(player1);
    const username2 = await getUsernameFromUUID(player2);



    // Example: Store match details in a map
    const matchId = uuid.v4();
    // actions[] examples: 
    // {type: "message", player: "player uuid", data: "hello"},
    // {type: "move", player: "player uuid", data: "rock"}, 
    // {type: "round-win", player: "player uuid", data: "won with rock"}
    // {type: "game-win", player: "player uuid", data: "won 3-0"}
    const matchDetails = {
        matchId: matchId,
        maxWins: 3,
        roundsPlayed: 0,
        winner: null,
        player1: {
            uuid: player1,
            username: username1,
            roundsWon: 0,
            selectedMove: null
        },
        player2: {
            uuid: player2,
            username: username2,
            roundsWon: 0,
            selectedMove: null
        },
        actions: [],
    };
    clients.get(player1).battleId = matchId;
    clients.get(player2).battleId = matchId;
    // Store match details on the server
    matchDetailsMap.set(matchId, matchDetails);
}

// Example function to get username from UUID (you need to implement this based on your database structure)
async function getUsernameFromUUID(playerUUID) {
    return new Promise((resolve, reject) => {
        connection.query('SELECT username FROM users WHERE id = ?', [playerUUID], (err, results) => {
            if (err) {
                console.error('Error fetching username from database:', err);
                reject(err);
            } else {
                if (results.length > 0) {
                    resolve(results[0].username);
                } else {
                    reject("Username not found for the given UUID");
                }
            }
        });
    });
}



wss.on('connection', (ws, req) => {

    let joined = false;

    let puuid;

    let searching = false;

    ws.on('message', async (message) => {
        const receivedMessage = JSON.parse(message);
        if (joined) {
            console.log(`Received from ${puuid}: ${message}`);


            switch (receivedMessage.action) {
                case 'start_search':
                    if (searching) {
                        break;
                    }
                    searching = true;
                    console.log(`Start searching with UUID: ${puuid}`);
                    searchingPlayers.push(puuid);

                    if (searchingPlayers.length >= 2) {
                        // Match two players
                        const player1 = searchingPlayers.shift();
                        const player2 = searchingPlayers.shift();

                        // Fetch usernames
                        const username1 = await getUsernameFromUUID(player1);
                        const username2 = await getUsernameFromUUID(player2);

                        // Handle the match on the server (e.g., store match details)
                        handleMatch(player1, player2);
                        // Inform both players about the match
                        clients.get(player1).websocket.send(JSON.stringify({ type: 'match_found', opponent: { username: username2 } }));
                        clients.get(player2).websocket.send(JSON.stringify({ type: 'match_found', opponent: { username: username1 } }));



                    }

                    ws.send(JSON.stringify({ message: 'Search started successfully' }));
                    break;
                case 'stop_search':
                    if (!searching) {
                        break;
                    }
                    let indexToRemove = searchingPlayers.indexOf(puuid);

                    // Check if the value exists in the array before removing
                    if (indexToRemove !== -1) {
                        // Remove the value at the specified index
                        searchingPlayers.splice(indexToRemove, 1);
                    }
                    searching = false;
                    ws.send(JSON.stringify({ message: 'Search stopped successfully' }));
                    break;
                case 'send message':
                    if (clients.get(puuid).battleId) {
                        let battleuuid = clients.get(puuid).battleId;

                        var matchObject = matchDetailsMap.get(battleuuid);

                        // Adding the new variable to the 'actions' array
                        matchObject.actions.push({ type: "message", player: puuid, data: receivedMessage.data });

                        // Update the object in the Map
                        matchDetailsMap.set(battleuuid, matchObject);
                        let name = await getUsernameFromUUID(puuid);
                        console.log(name);
                        clients.get(matchObject.player1.uuid).websocket.send(JSON.stringify({ type: 'chat_message', message: receivedMessage.data, user: name }));
                        clients.get(matchObject.player2.uuid).websocket.send(JSON.stringify({ type: 'chat_message', message: receivedMessage.data, user: name }));



                    }
                    break;
                case 'declare_move':
                    if (!clients.get(puuid).battleId) {
                        break;
                    }
                    if (receivedMessage.move !== "rock" && receivedMessage.move !== "paper" && receivedMessage.move !== "scissors") {
                        break;
                    }

                    let battleuuid = clients.get(puuid).battleId;

                    var matchObject = matchDetailsMap.get(battleuuid);

                    if (matchObject.winner){
                        break;
                    }

                    matchObject.actions.push({ type: "move", player: puuid, data: receivedMessage.move });

                    if (puuid === matchObject.player1.uuid) {
                        matchObject.player1.selectedMove = receivedMessage.move;
                    }
                    else {
                        matchObject.player2.selectedMove = receivedMessage.move;
                    }

                    matchDetailsMap.set(battleuuid, matchObject);
                    let name = await getUsernameFromUUID(puuid);
                    console.log(name);
                    clients.get(matchObject.player1.uuid).websocket.send(JSON.stringify({ type: 'move_declare', user: name }));
                    clients.get(matchObject.player2.uuid).websocket.send(JSON.stringify({ type: 'move_declare', user: name }));

                    if (matchObject.player1.selectedMove != null && matchObject.player2.selectedMove != null) {

                        if (matchObject.player1.selectedMove === matchObject.player2.selectedMove) {
                            matchObject.actions.push({ type: "round_draw" });

                            clients.get(matchObject.player1.uuid).websocket.send(JSON.stringify({ type: 'round_draw', data:"both players used " + matchObject.player1.selectedMove }));
                            clients.get(matchObject.player2.uuid).websocket.send(JSON.stringify({ type: 'round_draw' }));

                            matchObject.player1.selectedMove = null;
                            matchObject.player2.selectedMove = null;
                            matchDetailsMap.set(battleuuid, matchObject);
                        }
                        else if (matchObject.player1.selectedMove == "rock" && matchObject.player2.selectedMove == "paper") {
                            matchObject.actions.push({ type: "round-win", player: matchObject.player2.uuid, data: "won with paper" });
                            matchObject.player1.selectedMove = null;
                            matchObject.player2.selectedMove = null;
                            matchObject.player2.roundsWon += 1;
                            matchDetailsMap.set(battleuuid, matchObject);

                            clients.get(matchObject.player1.uuid).websocket.send(JSON.stringify({ type: "round-win", player: matchObject.player2.username, data: "won with paper" }));
                            clients.get(matchObject.player2.uuid).websocket.send(JSON.stringify({ type: "round-win", player: matchObject.player2.username, data: "won with paper" }));
                        }
                        else if (matchObject.player1.selectedMove == "rock" && matchObject.player2.selectedMove == "scissors") {
                            matchObject.actions.push({ type: "round-win", player: matchObject.player1.uuid, data: "won with rock" });
                            matchObject.player1.selectedMove = null;
                            matchObject.player2.selectedMove = null;
                            matchObject.player1.roundsWon += 1;
                            matchDetailsMap.set(battleuuid, matchObject);

                            clients.get(matchObject.player1.uuid).websocket.send(JSON.stringify({ type: "round-win", player: matchObject.player1.username, data: "won with rock" }));
                            clients.get(matchObject.player2.uuid).websocket.send(JSON.stringify({ type: "round-win", player: matchObject.player1.username, data: "won with rock" }));
                        }
                        else if (matchObject.player1.selectedMove == "paper" && matchObject.player2.selectedMove == "scissors") {
                            matchObject.actions.push({ type: "round-win", player: matchObject.player2.uuid, data: "won with scissors" });
                            matchObject.player1.selectedMove = null;
                            matchObject.player2.selectedMove = null;
                            matchObject.player2.roundsWon += 1;
                            matchDetailsMap.set(battleuuid, matchObject);

                            clients.get(matchObject.player1.uuid).websocket.send(JSON.stringify({ type: "round-win", player: matchObject.player2.username, data: "won with scissors" }));
                            clients.get(matchObject.player2.uuid).websocket.send(JSON.stringify({ type: "round-win", player: matchObject.player2.username, data: "won with scissors" }));
                        }
                        else if (matchObject.player1.selectedMove == "paper" && matchObject.player2.selectedMove == "rock") {
                            matchObject.actions.push({ type: "round-win", player: matchObject.player1.uuid, data: "won with paper" });
                            matchObject.player1.selectedMove = null;
                            matchObject.player2.selectedMove = null;
                            matchObject.player1.roundsWon += 1;
                            matchDetailsMap.set(battleuuid, matchObject);

                            clients.get(matchObject.player1.uuid).websocket.send(JSON.stringify({ type: "round-win", player: matchObject.player1.username, data: "won with paper" }));
                            clients.get(matchObject.player2.uuid).websocket.send(JSON.stringify({ type: "round-win", player: matchObject.player1.username, data: "won with paper" }));
                        }
                        else if (matchObject.player1.selectedMove == "scissors" && matchObject.player2.selectedMove == "rock") {
                            matchObject.actions.push({ type: "round-win", player: matchObject.player2.uuid, data: "won with rock" });
                            matchObject.player1.selectedMove = null;
                            matchObject.player2.selectedMove = null;
                            matchObject.player2.roundsWon += 1;
                            matchDetailsMap.set(battleuuid, matchObject);

                            clients.get(matchObject.player1.uuid).websocket.send(JSON.stringify({ type: "round-win", player: matchObject.player2.username, data: "won with rock" }));
                            clients.get(matchObject.player2.uuid).websocket.send(JSON.stringify({ type: "round-win", player: matchObject.player2.username, data: "won with rock" }));
                        }
                        else if (matchObject.player1.selectedMove == "scissors" && matchObject.player2.selectedMove == "paper") {
                            matchObject.actions.push({ type: "round-win", player: matchObject.player1.uuid, data: "won with scissors" });
                            matchObject.player1.selectedMove = null;
                            matchObject.player2.selectedMove = null;
                            matchObject.player1.roundsWon += 1;
                            matchDetailsMap.set(battleuuid, matchObject);

                            clients.get(matchObject.player1.uuid).websocket.send(JSON.stringify({ type: "round-win", player: matchObject.player1.username, data: "won with scissors" }));
                            clients.get(matchObject.player2.uuid).websocket.send(JSON.stringify({ type: "round-win", player: matchObject.player1.username, data: "won with scissors" }));
                        }

                        if (matchObject.player1.roundsWon >= matchObject.maxWins){
                            // {type: "game-win", player: "player uuid", data: "won 3-0"}
                            matchObject.actions.push({type: "game-win", player: matchObject.player1.uuid, data: "won " + matchObject.player1.roundsWon + "-" + matchObject.player2.roundsWon})
                            matchObject.winner = matchObject.player1.uuid;
                            matchDetailsMap.set(battleuuid, matchObject);


                            clients.get(matchObject.player1.uuid).websocket.send(JSON.stringify({ type: "game-win", player: matchObject.player1.username, data: "won " + matchObject.player1.roundsWon + "-" + matchObject.player2.roundsWon }));
                            clients.get(matchObject.player2.uuid).websocket.send(JSON.stringify({ type: "game-win", player: matchObject.player1.username, data: "won " + matchObject.player1.roundsWon + "-" + matchObject.player2.roundsWon  }));
                        }
                        if (matchObject.player2.roundsWon >= matchObject.maxWins){
                            // {type: "game-win", player: "player uuid", data: "won 3-0"}
                            matchObject.actions.push({type: "game-win", player: matchObject.player2.uuid, data: "won " + matchObject.player2.roundsWon + "-" + matchObject.player1.roundsWon})
                            matchObject.winner = matchObject.player2.uuid;
                            matchDetailsMap.set(battleuuid, matchObject);


                            clients.get(matchObject.player1.uuid).websocket.send(JSON.stringify({ type: "game-win", player: matchObject.player2.username, data: "won " + matchObject.player2.roundsWon + "-" + matchObject.player1.roundsWon }));
                            clients.get(matchObject.player2.uuid).websocket.send(JSON.stringify({ type: "game-win", player: matchObject.player2.username, data: "won " + matchObject.player2.roundsWon + "-" + matchObject.player1.roundsWon  }));
                        }

                    }


                    break;

                case 'cancel_move':
                    if (!clients.get(puuid).battleId) {
                        break;
                    }
                    if (true) {



                        let battleuuid = clients.get(puuid).battleId;

                        var matchObject = matchDetailsMap.get(battleuuid);

                        if (matchObject.winner){
                            break;
                        }

                        matchObject.actions.push({ type: "move", player: puuid, data: "cancel" });

                        if (puuid === matchObject.player1.uuid) {
                            matchObject.player1.selectedMove = null;
                        }
                        else {
                            matchObject.player2.selectedMove = null;
                        }

                        matchDetailsMap.set(battleuuid, matchObject);
                        let name = await getUsernameFromUUID(puuid);
                        console.log(name);
                        clients.get(matchObject.player1.uuid).websocket.send(JSON.stringify({ type: 'move_cancel', user: name }));
                        clients.get(matchObject.player2.uuid).websocket.send(JSON.stringify({ type: 'move_cancel', user: name }));
                    }



                    break;
                // Handle other actions as needed

                default:
                    console.log('Unknown action');
            }
        }
        else if (receivedMessage.type == "subscribe") {
            joined = true;
            puuid = receivedMessage.puuid;
            console.log(receivedMessage);
            if (!puuid) {
                ws.close();
                console.log("missingPUUID");
                return;
            }

            console.log(`WebSocket connection established for puuid: ${puuid}`);

            clients.set(puuid, { websocket: ws, battleId: null });

            ws.send(JSON.stringify({ type: 'uuid', puuid }));
        }


    });

    ws.on('close', () => {
        console.log(`WebSocket connection closed for puuid: ${puuid}`);
        clients.delete(puuid);
        if (searching) {
            let indexToRemove = searchingPlayers.indexOf(puuid);

            // Check if the value exists in the array before removing
            if (indexToRemove !== -1) {
                // Remove the value at the specified index
                searchingPlayers.splice(indexToRemove, 1);
            }
            searching = false;
        }

    });

    let among = "us";

    ws.send(JSON.stringify({ type: 'uuid', among }));
});

app.set("trust proxy", true);

app.use(
    session({
        secret: "your-secret-key",
        resave: false,
        saveUninitialized: true,
    })
);

app.use(async (req, res, next) => {
    if (req.session.clientId) {
        req.clientId = req.session.clientId;
    }

    next();
});

app.get("/api/join", async (req, res) => {
    req.session.clientId = uuid.v4();

    req.clientId = req.session.clientId;

    const username = req.query.username;

    try {

        const result = await addPlayer(username, req.clientId);
        console.log(result);
        res.json({ clientId: req.clientId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/api/test", (req, res) => {
    const clientId = req.clientId;
    const clientIP = req.ip;
    const userAgent = req.get("user-agent");

    console.log(`Client ID: ${clientId}`);

    res.json({ clientId });
});

app.get("/api", (req, res) => {
    const clientId = req.clientId;
    const clientIP = req.ip;
    const userAgent = req.get("user-agent");

    console.log(`Client IP: ${clientIP}`);
    console.log(`User-Agent: ${userAgent}`);
    console.log(`Client ID: ${clientId}`);

    res.json({ message: "Hello from da server :)", clientId });
});

server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});

function addPlayer(name, id) {
    return new Promise((resolve, reject) => {
        connection.query(`SELECT * FROM users WHERE username = ?`, [name], (err, results) => {
            if (err) {
                console.error('Error executing query:', err);
                reject(err);
                return;
            }

            if (results.length === 0) {

                connection.query(`SELECT * FROM users WHERE id = ?`, [id], (err, results) => {
                    if (err) {
                        console.error('Error executing query:', err);
                        reject(err);
                        return;
                    }

                    if (results.length === 0) {
                        connection.query(`INSERT INTO users (id, username) VALUES (?, ?)`, [id, name], (err, results) => {
                            if (err) {
                                console.error('Error executing query:', err);
                                reject(err);
                                return;
                            }
                            resolve("Player added");
                        });
                    }
                    else {
                        reject("Id already exists");
                    }
                });
            } else {
                reject("Player already exists");
            }
        });
    });
}
