require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");


const app = express();

app.use(cors());
app.use(express.json());


const server = http.createServer(app);



const io = new Server(server, {

    cors:{
        origin:"*"
    }

});



// =====================
// DATABASE
// =====================


const pool = new Pool({

    connectionString:
    process.env.DATABASE_URL,

    ssl:{
        rejectUnauthorized:false
    }

});



const SECRET="NOVACHAT_SECRET";





// =====================
// CREATE TABLES
// =====================


async function createTables(){



await pool.query(`

CREATE TABLE IF NOT EXISTS users(

id SERIAL PRIMARY KEY,

username TEXT NOT NULL,

email TEXT UNIQUE NOT NULL,

password TEXT NOT NULL,

created_at TIMESTAMP DEFAULT NOW()

);

`);





await pool.query(`

CREATE TABLE IF NOT EXISTS messages(

id SERIAL PRIMARY KEY,

username TEXT,

text TEXT,

created_at TIMESTAMP DEFAULT NOW()

);

`);







await pool.query(`

CREATE TABLE IF NOT EXISTS private_messages(

id SERIAL PRIMARY KEY,

sender_id INTEGER,

receiver_id INTEGER,

sender_name TEXT,

text TEXT,

created_at TIMESTAMP DEFAULT NOW()

);

`);




console.log("Database ready");


}








// =====================
// HOME
// =====================


app.get("/",(req,res)=>{


res.send(

"NovaChat Backend v4 🚀"

);


});









// =====================
// REGISTER
// =====================


app.post("/register",async(req,res)=>{


try{


const {
username,
email,
password
}=req.body;



const check =
await pool.query(

"SELECT id FROM users WHERE email=$1",

[email]

);



if(check.rows.length){

return res.json({

error:"User exists"

});


}




const hash =
await bcrypt.hash(
password,
10
);



const result =
await pool.query(

`

INSERT INTO users

(username,email,password)

VALUES($1,$2,$3)

RETURNING id,username,email

`,

[
username,
email,
hash
]

);



res.json(result.rows[0]);


}

catch(e){

res.status(500).json({

error:e.message

});

}


});









// =====================
// LOGIN
// =====================


app.post("/login",async(req,res)=>{


try{


const {
email,
password
}=req.body;



const result =
await pool.query(

"SELECT * FROM users WHERE email=$1",

[email]

);



if(!result.rows.length){

return res.json({

error:"Not found"

});

}



const user=result.rows[0];



const valid =
await bcrypt.compare(

password,

user.password

);



if(!valid){

return res.json({

error:"Wrong password"

});

}



const token =
jwt.sign(

{

id:user.id,

username:user.username

},

SECRET,

{

expiresIn:"7d"

}

);




res.json({

token,

user:{

id:user.id,

username:user.username,

email:user.email

}

});


}

catch(e){

res.status(500).json({

error:e.message

});

}


});









// =====================
// USERS
// =====================


app.get("/users",async(req,res)=>{


const result =
await pool.query(

`

SELECT id,username,created_at

FROM users

ORDER BY id DESC

`

);



res.json(result.rows);



});









// =====================
// PRIVATE HISTORY
// =====================


app.get(
"/private/:user1/:user2",

async(req,res)=>{


const result =
await pool.query(

`

SELECT *

FROM private_messages

WHERE

(sender_id=$1 AND receiver_id=$2)

OR

(sender_id=$2 AND receiver_id=$1)

ORDER BY id ASC

`,

[

req.params.user1,

req.params.user2

]


);



res.json(result.rows);



});









// =====================
// SOCKET
// =====================


let onlineUsers = new Map();



io.on("connection",(socket)=>{


console.log(
"User connected"
);





socket.on(
"online",

(user)=>{


onlineUsers.set(

socket.id,

user

);



io.emit(

"onlineUsers",

Array.from(
onlineUsers.values()
)

);


});







// общий чат история


pool.query(

`

SELECT *

FROM messages

ORDER BY id ASC

LIMIT 100

`

)

.then(result=>{


socket.emit(

"history",

result.rows

);


});







// общий чат сообщение


socket.on(

"message",

async(data)=>{


await pool.query(

`

INSERT INTO messages(username,text)

VALUES($1,$2)

`,

[

data.username,

data.text

]

);



io.emit(

"message",

data

);


});









// личные сообщения


socket.on(

"privateMessage",

async(data)=>{


await pool.query(

`

INSERT INTO private_messages

(
sender_id,
receiver_id,
sender_name,
text
)

VALUES($1,$2,$3,$4)

`,

[

data.sender_id,

data.receiver_id,

data.sender_name,

data.text

]

);



socket.broadcast.emit(

"privateMessage",

data

);



});









socket.on(

"disconnect",

()=>{


onlineUsers.delete(

socket.id

);



io.emit(

"onlineUsers",

Array.from(

onlineUsers.values()

)

);



console.log(

"User disconnected"

);


});



});








// =====================
// START
// =====================


createTables()

.then(()=>{


server.listen(

10000,

()=>{


console.log(

"NovaChat server started on port 10000"

);


});


});
