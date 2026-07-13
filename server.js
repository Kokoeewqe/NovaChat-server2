const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const http = require("http");
const db = require("./database");

const app = express();

app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});


// Создание таблицы при запуске
async function createTable() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            name TEXT,
            text TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    console.log("Database ready");
}


io.on("connection", async (socket) => {

    console.log("User connected");


    // Отправляем историю сообщений новому пользователю
    const result = await db.query(
        "SELECT * FROM messages ORDER BY id ASC"
    );

    socket.emit("history", result.rows);


    // Новое сообщение
    socket.on("message", async (data) => {

        await db.query(
            "INSERT INTO messages(name, text) VALUES($1, $2)",
            [
                data.name,
                data.text
            ]
        );


        io.emit("message", data);

    });


    socket.on("disconnect", () => {
        console.log("User disconnected");
    });

});


app.get("/", (req, res) => {
    res.send("NovaChat server is working!");
});


createTable();


server.listen(10000, () => {
    console.log("NovaChat server started on port 10000");
});
