# About EzChat

This project is intended to be the simplest possible implementation of a usable Chat App (i.e. person to person messaging system) that can be done with just plain JavaScript using WebRTC. The idea is that, as long as the EzChatServer (a simple WebRTC Signaling Server) is running on the web, then multiple parties will be able to have the ability to Chat (send Messages) in realtime in a way that's completely browser-to-browser without any server in between, watching or managing messages. In other words the EzChatServer is only used to allow each Browser (Chat App Client) to find out where the other chat participants are to initiate a direct browser-to-browser communications with them.

We support any number of users to be in a chat room simultaneously.

I think it might be theoretically possible to use a publicly avilable "Signaling Server", I have not had a chance to experiment with that, becuase it's simpler to just run one myself.

# How to Run

Run `node EzChatServer.js --host 0.0.0.0 --port 8080`