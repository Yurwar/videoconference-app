//Отримання усіх необхідних залежностей та бібліотек
const express = require('express')
const app = express()
const server = require('http').Server(app)
const io = require('socket.io')(server)
const {ExpressPeerServer} = require('peer');
//Запуск WebRTC сервера PeerJS
const peerServer = ExpressPeerServer(server, {
    debug: true
});
const {v4: uuidV4} = require('uuid')
//Масив ID підключених клієнтів
let usersId = [];

//Запуск та конфігурація WebSocket інтерфейсу
io.listen(4000);
io.set("transports", ["xhr-polling"]);
io.set("polling duration", 10);

//Налаштування шляху до PeerJS обробника
app.use('/peerjs', peerServer);

//Налаштування відображення для клієнта
app.set('view engine', 'ejs')
app.use(express.static('public'))

//У випадку якщо користувач переходить на сторінку застосунку для нього створюється нова кімната з
//випадковим ключем та його переносить на сторінку кімнати
app.get('/', (req, res) => {
    res.redirect(`/${uuidV4()}`)
})

//Якщо користувач переходить на сторінку з ідентифікатором кімнати в шляху запиту
//він отримує головну сторінку на якій відбувається конференція
app.get('/:room', (req, res) => {
  res.render('index', { roomId: req.params.room })
})

//Функція обробки повідомлення
//Слухає надіслані у чат повідомлення та дублює їх для усіх підключених клієнтів
function handleOnMessage(socket, roomId, userId) {
    socket.on('message', (message) => {
        io.to(roomId).emit('createMessage', message, userId)
    });
}

//Функція яка слухає початок демонстрації екрану та повідомляє про це усіх інших клієнтів
function handleOnShare(socket, roomId) {
    socket.on('share', () => {
        socket.to(roomId).broadcast.emit('screen-share')
    })
}

//Функція яка слухає закінчення демонстрації екрану та повідомляє про це усіх інших клієнтів
function handleOnStopShare(socket, roomId) {
    socket.on('stop-share', () => {
        socket.to(roomId).broadcast.emit('stop-screen-share')
    })
}

//Функція яка слухає події відключення клієнтів від конференції та повідомляє про це інших клієнтів
function handleOnDisconnect(socket, roomId, userId) {
    socket.on('disconnect', () => {
        socket.to(roomId).broadcast.emit('user-disconnected', userId)
    })
}

//Головний скрипт який налаштовує слухачі подій для кожного з клієнтів що приєднуються до сервера та кімнати
//та розподіляє клієнтів у відповідні обрані кімнати
io.on('connect', socket => {
    socket.on('join-room', (roomId, userId) => {
        usersId.push(userId);
        socket.join(roomId)
        socket.to(roomId).broadcast.emit('user-connected', userId, usersId);
        handleOnMessage(socket, roomId, userId);
        handleOnShare(socket, roomId);
        handleOnStopShare(socket, roomId);
        handleOnDisconnect(socket, roomId, userId);
    })
})

//Запуск сервера на порті 3000
server.listen(process.env.PORT || 3000)
