# About EzChat

This project is intended to be the simplest possible implementation of a usable Chat App (i.e. person to person messaging system) that can be done with just plain JavaScript using WebRTC. The idea is that, as long as the EzChatServer (a simple WebRTC Signaling Server) is running on the web, then multiple parties will be able to have the ability to Chat (send Messages) in realtime in a way that's completely browser-to-browser without any server in between, watching or managing messages. In other words the EzChatServer is only used to allow each Browser (Chat App Client) to find out where the other chat participants are to initiate a direct browser-to-browser communications with them.

We support any number of users to be in a chat room simultaneously, and any number of different chat rooms can also be running at the same time.

# How to Run

    npm init -y
    npm install ws
    node EzChatServer.js --host 0.0.0.0 --port 8080 --httpPort 8000


# Versions 

In the `versions` folder you'll see various snapshots, so that the original simpler versions of the app are available, since the app is now evolving into a more usable production-quality app, where as the earlier versions are useful for learning about WebRTC.