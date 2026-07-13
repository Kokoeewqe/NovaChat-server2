const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
require("dotenv").config();


const app = express();

const server = http.createServer(app);


app.use(cors({
    origin:"*"
}));

app.use(express.json());

app.use(express.urlencoded({
    extended:true
}));


const io = new Server(server,{
    cors:{
        origin:"*"
    }
});



// DATABASE

const pool = new Pool({

    connectionString:
    process.env.DATABASE_URL,

    ssl:{
        rejectUnauthorized:false
    }

});



// CONFIG

const SECRET =
process.env.JWT_SECRET ||
"novachat-secret";




// UPLOAD

const storage = multer.diskStorage({

destination:function(req,file,cb){

cb(null,"uploads/");

},


filename:function(req,file,cb){

cb(
null,
Date.now()+"-"+file.originalname
);

}

});


const upload = multer({
storage
});


app.use(
"/uploads",
express.static("uploads")
);




// DATABASE CREATE


async function createTables(){


await pool.query(`

CREATE TABLE IF NOT EXISTS users(

id SERIAL PRIMARY KEY,

username TEXT NOT NULL,

email TEXT UNIQUE NOT NULL,

password TEXT NOT NULL,

avatar TEXT DEFAULT '👤',

bio TEXT DEFAULT '',

status TEXT DEFAULT 'offline',

last_seen TIMESTAMP DEFAULT NOW(),

created_at TIMESTAMP DEFAULT NOW()

);

`);


await pool.query(`

CREATE TABLE IF NOT EXISTS messages(

id SERIAL PRIMARY KEY,

sender_id INTEGER,

username TEXT,

text TEXT,

created_at TIMESTAMP DEFAULT NOW()

);

`);
// =====================
// AUTH
// =====================


function createToken(user){

return jwt.sign(

{
id:user.id,
username:user.username,
email:user.email
},

SECRET,

{
expiresIn:"30d"
}

);

}



// =====================
// REGISTER
// =====================


app.post("/register", async(req,res)=>{


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

RETURNING *

`,

[
username,
email,
hash
]

);



const user =
result.rows[0];



res.json({

token:createToken(user),

user:user

});


}

catch(error){


console.log(error);


res.status(400).json({

error:"Такой email уже существует"

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



if(result.rows.length===0){

return res.status(404).json({

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

return res.status(401).json({

error:"Неверный пароль"

});

}



res.json({

token:createToken(user),

user:user

});


}


catch(error){

console.log(error);


res.status(500).json({

error:"Ошибка сервера"

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

SELECT

id,
username,
avatar,
bio,
status,
last_seen,
created_at

FROM users

ORDER BY id DESC

`

);


res.json(result.rows);


});






// =====================
// MESSAGES HISTORY
// =====================


app.get("/messages",async(req,res)=>{


const result =
await pool.query(

`

SELECT *

FROM messages

ORDER BY created_at ASC

LIMIT 300

`

);


res.json(result.rows);


});// =====================
// SOCKET.IO
// =====================


let onlineUsers = [];



io.on("connection",(socket)=>{


console.log(
"User connected"
);





// USER ONLINE

socket.on("online",async(user)=>{


socket.user=user;



await pool.query(

`

UPDATE users

SET

status='online',

last_seen=NOW()

WHERE id=$1

`,

[user.id]

);



onlineUsers.push({

id:user.id,

username:user.username,

avatar:user.avatar,

socket:socket.id

});



io.emit(
"onlineUsers",
onlineUsers
);


});







// PUBLIC MESSAGE


socket.on("message",async(data)=>{


const result =
await pool.query(

`

INSERT INTO messages

(
sender_id,
username,
text
)

VALUES($1,$2,$3)

RETURNING *

`,

[

data.sender_id,

data.username,

data.text

]

);



io.emit(

"message",

result.rows[0]

);


});







// TYPING


socket.on("typing",(data)=>{


socket.broadcast.emit(

"typing",

data

);


});








// DISCONNECT


socket.on("disconnect",async()=>{


if(socket.user){


await pool.query(

`

UPDATE users

SET

status='offline',

last_seen=NOW()

WHERE id=$1

`,

[socket.user.id]

);


}



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







// =====================
// START SERVER
// =====================


createTables()

.then(()=>{


server.listen(

process.env.PORT || 10000,

()=>{


console.log(
"NovaChat Pro server started"
);


});


});
