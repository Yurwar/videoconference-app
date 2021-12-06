//Створення підключення клієнта до сервера
const socket = io('/')
//Основна частина сторінки на якій клієнт бачить відео усіх інших учасників конференції
const videoGrid = document.getElementById('video-grid')
//Оголошення поточного клієнта
const currentPeer = new Peer()
//Словник ключ-значення в якому по ключу ідентифікатору знаходиться медіа-підключення до іншого клієнта
//через яке передаються голосові та відео дані в режимі реального часу
const callToPeer = {}
//Поточний потік відео
let currentVideoStream;
//Показник що вказує чи запущено в поточного користувача демонстрація екрану
let isSharing;
//Масив для тимчасового збереження відео та аудіо стрімів інших учасників
//у випадку трансляції екрану
let stashedStreams = [];
//Поточний потік з відео демонстрацією екрану
let screenSharingStream;
//Ідентифікатори усіх користувачів підключених до кімнати
let totalUsersId = [];

//Функція обробки події створення повідомлення
//При отриманні нотифікації від сервера про створення повідомлення
//додає це повідомлення на головну сторінку в розділ чату
function handleCreateMessage() {
    socket.on("createMessage", (message, userId) => {
        $("ul").append(`<li class="message"><b>${userId}</b><br/>${message}</li>`);
        scrollDown()
    })
}

//Оброблює подію підключення нового користувача до конференції
//підключається до його відеопотоку та додає його ідентифікатор
//до масиву усіх ідентифікаторів
function handleUserConnected(stream) {
    socket.on('user-connected', (userId, usersId) => {
        connectToNewUser(userId, stream)
        totalUsersId = usersId;
    })
}

//Оброблює подію у випадку запиту на приєднання нового клієнта до поточного клієнта
//Створює нове вікно відео для нового клієнта та у випадку якщо це відео є демонстрацією екрана
//додає до нього відповідний ідентифікатор для змінення відображення цього відео на весь екран
function handleCurrentPeerOnCall(stream) {
    currentPeer.on('call', call => {
        call.answer(stream)
        const video = document.createElement('video');

        if (call.metadata != null && call.metadata['sharingConnection']) {
            screenSharingStream = call;
            video.id = 'screen-sharing';
            video.classList.add("sharing")
        }
        addOnStreamHandler(call, video);
    })
}

//Отримує доступ до мікрофона та камери користувача з браузера
navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
//Після отримання доступу створює аудіо та відео потік та додає обробники вищеописані обробники подій до клієнта
}).then(stream => {
    currentVideoStream = stream;
    const myVideo = document.createElement('video')
    myVideo.muted = true;
    addVideoStream(myVideo, stream)
    handleCurrentPeerOnCall(stream);
    handleUserConnected(stream);
    handleSendMessage();
    handleCreateMessage();

})

//Реагує на подію початку демонстрації екрану
//видаляє усі елементи з відео інших користувачів та замінює їх на одне
//відео з демонстрацією для економії місця
//Відеопотоки інших користувачів не закриваються а зберігаються в тимчасовому масиві
socket.on('screen-share', () => {
    let allWebcams = videoGrid.getElementsByTagName('video')

    let webcams = Array.from(allWebcams).filter(wc => wc.id !== 'screen-sharing')

    clearVideoGrid();

    for (let i = 0; i < webcams.length; i++) {
        stashedStreams.push(webcams[i].srcObject);
    }
})

//Реагує на подію зупинки демонстрації екрану
//Видаляє відео демонстрації з головної сторінки та повертає назад
//відео учасників конференції з тимчасового масиву
socket.on('stop-screen-share', () => {
    if (screenSharingStream != null) {
        screenSharingStream.close()
    }
    document.getElementById('screen-sharing').remove();

    clearVideoGrid();
    stashedStreams.forEach(videoStream => {
        let video = document.createElement('video');
        addVideoStream(video, videoStream);
    });
    stashedStreams = [];
})

//У випадку якщо інший користувач конференції відключився від неї
//закриває WebRTC з'єднання до нього
socket.on('user-disconnected', userId => {
    if (callToPeer[userId]) {
        callToPeer[userId].close();
    }
})

//При створенні поточного клієнта підключається до кімнати на сервері
currentPeer.on('open', id => {
    socket.emit('join-room', ROOM_ID, id)
})

//Очищує панель з відео
function clearVideoGrid() {
    videoGrid.innerHTML = '';
}

//Додає прослуховувач події початку надсилання аудіо та відео потоку та додає відео на екран
function addOnStreamHandler(call, video) {
    call.on('stream', userVideoStream => {
        addVideoStream(video, userVideoStream);
    })
}

//Приєднується до нового користувача та надсилає йому свій аудіо та відео потік
//також додає відео потік користувача до якого встановлюється з'єднання на головний екран
function connectToNewUser(userId, stream) {
    const call = currentPeer.call(userId, stream);
    const video = document.createElement('video');
    addOnStreamHandler(call, video)
    call.on('close', () => {
        video.remove()
    })

    //Додає об'єкт потоку до загального місця збереження по ключу нового користувача
    callToPeer[userId] = call
}

//Відображає відео потік на екрані
function addVideoStream(video, stream) {
    video.srcObject = stream
    video.addEventListener('loadedmetadata', () => {
        video.play()
    })
    videoGrid.append(video)
}

//Оброблює подію натискання на клавішу Enter при відправці повідомлення
//та відправляє повідомлення на сервер для того щоб інші клієнти отримали його
function handleSendMessage() {
    let text = $("input");
    $('html').keydown(function (e) {
        const enterKeyNumber = 13;
        if (e.which === enterKeyNumber && text.val().length !== 0) {
            socket.emit('message', text.val());
            text.val('')
        }
    });
}

//Функція для початку демонстрації екрану
//Переміщає усі інші відео з екрану в тимчасове місце збереження та додає відео з демонстрацією
function startSharing() {
    isSharing = true;
    let webcams = videoGrid.getElementsByTagName('video')

    for (let i = 0; i < webcams.length; i++) {
        stashedStreams.push(webcams[i].srcObject);
    }

    clearVideoGrid();

    //Отримує доступ до екрану користувача разом з його курсором та відправляє цей відео потік
    //усім приєднаним до кімнати користувачам. Також нотифікує сервер для того щоб він надіслав цю подію іншим користувачам
    navigator.mediaDevices.getDisplayMedia({cursor: true}).then(stream => {
        let video = document.createElement('video');
        video.classList.add('sharing');
        addVideoStream(video, stream);
        //Початок відправки відео потоку демонстрації іншим клієнтам
        totalUsersId.filter(id => id !== currentPeer.id).forEach(uid => {
            currentPeer.call(uid, stream, {'metadata': {'sharingConnection': true}})
        })
        //Нотифікація серверу
        socket.emit('share');
    })
    //Міняє відображення кнопки
    setStopSharingButton();
}

//Функція для зупинки демонстрації екрану, закриває відео потік демонстрації
//та повертає усі відео інших користувачів назад на екран
//Також повідомляє сервер про закінчення демонстрації
function stopSharing() {
    isSharing = false;
    let sharingBlockObject = videoGrid.getElementsByTagName('video')[0].srcObject;
    sharingBlockObject.getTracks()[0].stop();
    clearVideoGrid();
    stashedStreams.forEach(videoStream => {
        let video = document.createElement('video');
        addVideoStream(video, videoStream);
        socket.emit('stop-share');
    });
    stashedStreams = [];
    setStartSharingButton();
}

//Функція для зміни стану передачі аудіо потоку
//Перевіряє чи аудіопотік передається, якщо так, то вимикає передачу, в іншому випадку вмикає
const muteUnmute = () => {
    const enabled = currentVideoStream.getAudioTracks()[0].enabled;
    if (enabled) {
        currentVideoStream.getAudioTracks()[0].enabled = false;
        setUnmuteButton();
    } else {
        currentVideoStream.getAudioTracks()[0].enabled = true;
        setMuteButton();
    }
}

//Функція для міни стану передачі відео потоку
const playStartStop = () => {
    let enabled = currentVideoStream.getVideoTracks()[0].enabled;
    if (enabled) {
        currentVideoStream.getVideoTracks()[0].enabled = false;
        setPlayVideoButton()
    } else {
        currentVideoStream.getVideoTracks()[0].enabled = true;
        setStopVideoButton()
    }
}

//Функція що реагує на натискання кнопки початку демонстрації екрану
//та в залежності від поточного стану вмикає або вимикає демонстрацію
const shareStartStop = () => {
    if (!isSharing) {
        startSharing();
    } else {
        stopSharing();
    }
}

//Функція що реагує на натискання кнопки чату та відповідно закриває або відкирває його
const chatOpenClose = () => {
    let chatDisplay = document.querySelector('.main__right').style.display;

    if (chatDisplay === '' || chatDisplay === 'flex') {
        document.querySelector('.main__right').style.display = 'none';
        document.querySelector('.main__left').style.flex = "1";
    } else {
        document.querySelector('.main__right').style.display = 'flex';
        document.querySelector('.main__left').style.flex = "0.8";
    }
}

//Функція що реагує на натискання кнопки відключення від конференції
//закриває з'єднання, надсилає подію про відключення на сервер
//та переносить користувача на сторінку виходу
const leaveMeeting = () => {
    socket.disconnect();
    setEmptyPage();
}

//Функція що переносить корисувача на сторінку виходу
function setEmptyPage() {
    document.querySelector('.main').innerHTML = `
    <div class="leave-text">You left the meeting!, Thank you for using our VideoConference App</div>
  `;
}

//Функція що міняє картинку відображення кнопки демонстрації екрану
function setStopSharingButton() {
    document.querySelector('.main__share_button').innerHTML = `
  <i class="fas fa-ban"></i>
  <span>Stop sharing</span>
  `;
}

//Функція що міняє картинку відображення кнопки демонстрації екрану
function setStartSharingButton() {
    document.querySelector('.main__share_button').innerHTML = `
  <i class="fas fa-angle-up"></i>
  <span>Share</span>
  `;
}

//Функція що міняє картинку відображення кнопки відключення аудіопотоку
function setMuteButton() {
    document.querySelector('.main__mute_button').innerHTML = `
    <i class="fas fa-microphone"></i>
    <span>Mute</span>
  `;
}

//Функція що міняє картинку відображення кнопки підключення аудіопотоку
function setUnmuteButton() {
    document.querySelector('.main__mute_button').innerHTML = `
    <i class="unmute fas fa-microphone-slash"></i>
    <span>Unmute</span>
  `;
}

//Функція що міняє картинку відображення кнопки відключення відеопотоку
function setStopVideoButton() {
    document.querySelector('.main__video_button').innerHTML = `
    <i class="fas fa-video"></i>
    <span>Stop Video</span>
  `;
}

//Функція що міняє картинку відображення кнопки підключення відеопотоку
function setPlayVideoButton() {
    document.querySelector('.main__video_button').innerHTML = `
  <i class="stop fas fa-video-slash"></i>
    <span>Play Video</span>
  `;
}

//Функція що відгортає частину на якій зображено чат униз сторінки
function scrollDown() {
    let d = $('.main__chat_window');
    d.scrollTop(d.prop("scrollHeight"));
}
