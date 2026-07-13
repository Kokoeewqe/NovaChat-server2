const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();


const app = express();
const server = http.createServer(app);


app.use(cors({
    origin:"*"
}));

app.use(express.json());



const io = new Server(server,{
    cors:{
        origin:"*"
    }
});



const pool = new Pool({

    connectionString: process.env.DATABASE_URL,

    ssl:{
        rejectUnauthorized:false
    }

});



const SECRET =
process.env.JWT_SECRET || "novachat-secret";





async function createTables(){


    await pool.query(`

    CREATE TABLE IF NOT EXISTS users(

        id SERIAL PRIMARY KEY,

        username TEXT NOT NULL,

        email TEXT UNIQUE NOT NULL,

        password TEXT NOT NULL,

        status TEXT DEFAULT 'offline',

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



    console.log("Database ready");

}





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



const user=result.rows[0];



res.json({

token:createToken(user),

user:user

});



}

catch(error){


console.log(error);


res.status(400).json({

error:"Email уже используется"

});


}


});







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



const user=result.rows[0];



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


});








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


});







let onlineUsers=[];



io.on("connection",(socket)=>{


console.log("User connected");



socket.on("online",(user)=>{


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







socket.on("message",async(data)=>{


const result =
await pool.query(

`

INSERT INTO messages

(sender_id,username,text)

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






socket.on("disconnect",()=>{


onlineUsers =
onlineUsers.filter(

u=>u.socket!==socket.id

);



io.emit(

"onlineUsers",

onlineUsers

);



console.log("User disconnected");


});


});






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
