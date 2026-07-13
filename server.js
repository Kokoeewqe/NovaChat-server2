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



// =====================
// UPLOADS
// =====================


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




// =====================
// CONFIG
// =====================


const SECRET =
process.env.JWT_SECRET ||
"novachat_secret";




// =====================
// DATABASE TABLES
// =====================


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


console.log(
"Database ready"
);


}



// =====================
// TOKEN
// =====================


function generateToken(user){


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

token:
generateToken(user),

user

});


}

catch(error){


console.log(error);


res.status(400).json({

error:"Email уже существует"

});


}


});



// =====================
// LOGIN
// =====================


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

token:
generateToken(user),

user

});


});
// =====================
// USERS
// =====================


app.get("/users", async(req,res)=>{


const result = await pool.query(`

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

`);


res.json(result.rows);


});




// =====================
// UPDATE PROFILE
// =====================


app.put("/profile/:id", async(req,res)=>{


const {

username,

avatar,

bio

}=req.body;



const result =
await pool.query(

`

UPDATE users

SET

username=$1,

avatar=$2,

bio=$3

WHERE id=$4

RETURNING *

`,

[

username,

avatar,

bio,

req.params.id

]

);



res.json(result.rows[0]);


});




// =====================
// AVATAR UPLOAD
// =====================


app.post(
"/upload/:id",
upload.single("avatar"),
async(req,res)=>{


if(!req.file){

return res.status(400).json({

error:"Файл не найден"

});

}



const url =
"/uploads/" + req.file.filename;



await pool.query(

`

UPDATE users

SET avatar=$1

WHERE id=$2

`,

[

url,

req.params.id

]

);



res.json({

avatar:url

});


});




// =====================
// ALL MESSAGES
// =====================


app.get("/messages",async(req,res)=>{


const result =
await pool.query(`

SELECT *

FROM messages

ORDER BY created_at ASC

LIMIT 300

`);



res.json(result.rows);


});




// =====================
// PRIVATE MESSAGES
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

ORDER BY created_at ASC

`,

[

req.params.user1,

req.params.user2

]

);



res.json(result.rows);


});





// =====================
// SOCKET.IO
// =====================


let onlineUsers=[];



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




// PUBLIC CHAT MESSAGE


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





// PRIVATE MESSAGE


socket.on(

"privateMessage",

async(data)=>{


const result =
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

RETURNING *

`,

[

data.sender_id,

data.receiver_id,

data.sender_name,

data.text

]

);



const user =
onlineUsers.find(

u=>u.id===data.receiver_id

);



if(user){


io.to(user.socket)

.emit(

"privateMessage",

result.rows[0]

);


}


});





// TYPING


socket.on(

"typing",

(data)=>{


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
// START
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
