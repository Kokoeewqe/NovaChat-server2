const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");



const app = express();

const server = http.createServer(app);



app.use(cors());

app.use(express.json());





const io = new Server(server,{

cors:{
origin:"*"
}

});







// =======================
// DATABASE
// =======================


const pool = new Pool({

connectionString:
process.env.DATABASE_URL,

ssl:{
rejectUnauthorized:false
}

});







await pool.query(`

CREATE TABLE IF NOT EXISTS users(

id SERIAL PRIMARY KEY,

username TEXT NOT NULL,

email TEXT UNIQUE NOT NULL,

password TEXT NOT NULL,

avatar TEXT DEFAULT '👤',

status TEXT DEFAULT 'offline',

last_seen TIMESTAMP DEFAULT NOW(),

created_at TIMESTAMP DEFAULT NOW()

);

`);


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








// =======================
// REGISTER
// =======================


app.post("/register",async(req,res)=>{


try{


const {
username,
email,
password

}=req.body;



const hash =
await bcrypt.hash(password,10);



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



res.json({

user:result.rows[0]

});



}

catch(e){


console.log(e);


res.json({

error:"Пользователь уже существует"

});


}


});









// =======================
// LOGIN
// =======================


app.post("/login",async(req,res)=>{


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

error:"Пользователь не найден"

});

}



const user =
result.rows[0];



const check =
await bcrypt.compare(

password,

user.password

);



if(!check){

return res.json({

error:"Неверный пароль"

});

}



res.json({

user:{

id:user.id,

username:user.username,

email:user.email

}

});


});









// =======================
// USERS
// =======================


app.get("/users",async(req,res)=>{


const result =
await pool.query(

`
SELECT id,username
FROM users
ORDER BY id DESC

`

);



res.json(result.rows);


});









// =======================
// PRIVATE HISTORY
// =======================


app.get(
"/private/:user1/:user2",

async(req,res)=>{


const {
user1,
user2

}=req.params;



const result =
await pool.query(

`

SELECT *

FROM private_messages

WHERE

(sender_id=$1 AND receiver_id=$2)

OR

(sender_id=$2 AND receiver_id=$1)

ORDER BY created_at ASC


`,

[
user1,
user2
]

);



res.json(result.rows);



});









// =======================
// SOCKET
// =======================


let onlineUsers=[];




io.on("connection",(socket)=>{


console.log(
"User connected"
);





socket.on(
"online",
(user)=>{


socket.user=user;



onlineUsers.push({

id:user.id,

username:user.username,

socket:socket.id

});




io.emit(

"onlineUsers",

onlineUsers

);


});







// LOAD CHAT HISTORY


pool.query(

`

SELECT *

FROM messages

ORDER BY created_at ASC

LIMIT 100


`

)

.then(result=>{


socket.emit(

"history",

result.rows

);


});









// PUBLIC MESSAGE


socket.on(

"message",

async(data)=>{


await pool.query(

`

INSERT INTO messages

(username,text)

VALUES($1,$2)

`,

[
data.username,
data.text
]

);



io.emit(

"message",

{

username:data.username,

text:data.text,

created_at:new Date()

}

);



});









// PRIVATE MESSAGE


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





const receiver =
onlineUsers.find(

u=>u.id===data.receiver_id

);



if(receiver){


io.to(receiver.socket)
.emit(

"privateMessage",

data

);


}




});









socket.on(

"disconnect",

()=>{


onlineUsers =
onlineUsers.filter(

u=>u.socket!==socket.id

);



io.emit(

"onlineUsers",

onlineUsers

);



console.log(
"User disconnected"
);



});


});









// =======================
// START
// =======================


createTables()
.then(()=>{


server.listen(

process.env.PORT || 10000,

()=>{


console.log(

"NovaChat server started"

);


});


});
