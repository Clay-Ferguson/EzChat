# About EzChat

### Peer-to-Peer WebRTC-based Chat/Messaging Web App in pure JavaScript using a Single HTML file design.

This project is intended to be the simplest possible implementation of a usable **Chat App** (i.e. person to person messaging system) that can be done with just plain JavaScript using WebRTC. 

The idea is that, as long as the EzChatServer (a simple WebRTC Signaling Server) is running on the web, then multiple parties will be able to have the ability to Chat (send Messages) in realtime in a way that's completely browser-to-browser (i.e. peer-to-peer) without any server in between, watching or managing messages. In other words, the EzChatServer is only used to allow each Browser (Chat App Client) to locate other chat participants, but the server plays no role in the communications.

We support any number of users to be in a chat room simultaneously, and any number of different chat rooms can also be running at the same time.

# Comming Soon!

I'll be running a free public version of EzChatServer soon on the web, so you can take this code for a test drive yourself. A single tiny EzChatServer should be able to support a large number of users, because it doesn't handle any of the data transfers, but only the WebRTC peer locator service. I'll be posting the URL for that into this README file.

# How it Works 

## The Server

The command shown above starts the `EzChatServer` which is a very tiny web server with just two simple purposes 1) To serve the `EzChat.html` as a static file at url `/chat` like (http://localhost:8000/chat) and 2) To run as a `Signaling Server` which simply serves to allow the clients/peers/browses to find each other, which happens automatically.

## The Chat Client

The chat client itself is very simple. It allows users to enter their username and a chat room name, and then click "Connect" button, to join that room. Rooms are automatically created once they're needed, by someone. The room's history of chat message is kept only on the peers (clients) and is saved in browser local storage. None of the messages are ever seen by the server. Once you join a room you're in there permanently until you refresh your browser. If you refresh the browser you'll need to click "Connect" again to resume, but the chat room's history will still be there. Note, however that since this is a peer-to-peer system any conversations that happen in a room while you're not online and in that room, will not be visible to you. This is because there's currently no strategy for syncing messages `across` all users that have ever participated in a room. This could be a potential future feature.


# Versions 

In the `versions` folder you'll see various snapshots, so that the original simpler versions of the app are available, since the app is now evolving into a more usable production-quality app, whereas the earlier versions are useful for learning about WebRTC.


# Why no Web Frameworks?

You'll notice this app has no Vue, React, Angular, or any other frameworks, and is implemented entirely in a single HTML file. This was done very intentionally to keep this code understandable and usable by all JavaScript developers. This app was sort of done as an experiment also just to prove what the simplest possible implementation of Chat App can look like. 

# How to Run

You'll need to install Node and NPM first.

Run this on some server that's visible on the web. For development purposes you can run on localhost as well of course.

    git clone https://github.com/Clay-Ferguson/EzChat
    cd EzChat
    npm init -y
    npm install ws
    node EzChatServer.js --host 165.22.11.83 --port 8080 --httpPort 80
    
For running on localhost, use this node command instead of the above.
    
    node EzChatServer.js --host 0.0.0.0 --port 8080 --httpPort 8000

Once you have the project cloned, and you need to run the latest version, the following commands will get the latest from git, and run it.

    git reset --hard HEAD
    git pull --force
    sudo node EzChatServer.js --host 165.22.11.83 --port 8080 --httpPort 80

*After starting the server the Chat App will be live at `http://165.22.11.83/chat`. This IP address is the experimental testbed location for the app, and it's not yet running full time, and will be up and down periodically, so the app is not quite deployed to production yet, nor is there a DNS name registered for it.*


# Caveats/Warnings

* Currently this project represents a total of 12 hours of "Vibe Coding". I reviewed the code, but have not fully vetted all of it, so there may be problems, so once I have done more complete testing I'll update this status here, but for now this is mostly untested, but appears to work.

* Currently this tool is meant to be run among friends, and there's no current way to stop someone from logging in with some identity (user name) that isn't really who they are. However if you need privacy, the way you can accomplish that is via an unguessable room name. If nobody else but your group of friends knows the name of the room, then no untrusted persons can ever get into your room, because they simply won't know its name, and there's no way to list room names, by design.