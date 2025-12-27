# VoiceChat-p2p - Natla

Natla is a decentralized peer-to-peer (P2P) voice and video communication platform built using Electron and WebRTC technology. It features a lightweight Python-based signaling server, ensuring low-latency communication, end-to-end media streaming, and secure access control.

## Overview

Unlike traditional VoIP applications that route media through central servers, Natla establishes direct connections between clients. The central server is utilized strictly for signaling (handshaking) and room management, ensuring privacy and minimal latency.

## Key Features

* **Secure Access Control:** Room access is protected via a custom Access Key system. Only users with the correct server address and key can establish a connection.
* **P2P Architecture:** Audio, video, and file data are transmitted directly between peers using WebRTC.
* **Screen Sharing:** High-definition, low-latency desktop streaming capabilities.
* **Integrated Soundpad:** Built-in audio effects board for real-time interaction.
* **Peer-to-Peer File Transfer:** Secure drag-and-drop file sharing between users without server-side limitations.
* **Advanced Audio Management:** Individual user volume control and real-time audio visualization.

---

## Installation and Usage

### Client

1.  **Download**
    Download the latest installer (`Natla Setup.exe`) from the **Releases** section of this repository.

2.  **Initial Configuration**
    Upon launching the application for the first time, a configuration modal will appear requesting the following details:
    * **Server Address:** The WebSocket address of the signaling server (e.g., `ws://your-server-ip:8080`).
    * **Access Key:** The secure passphrase required to authenticate with the server.

3.  **Connection**
    Click **Connect** to save your settings. The application stores the configuration securely in the user's `AppData` directory to prevent permission issues.

> **Note:** If the connection fails or an incorrect key is provided, the application will automatically reset the configuration and prompt for credentials again upon the next launch.

---

## Server Deployment (Self-Hosting)

Natla requires a lightweight WebSocket signaling server to manage peer discovery. You can host this server on AWS, DigitalOcean, or a local machine.

### Prerequisites

* Python 3.8 or higher
* `websockets` library

### Deployment Steps

1.  **Clone the Repository**
    ```bash
    git clone [https://github.com/yourusername/natla.git](https://github.com/yourusername/natla.git)
    cd natla
    ```

2.  **Install Dependencies**
    ```bash
    pip install websockets asyncio
    ```

3.  **Configure Security**
    Open `server.py` in a text editor. Locate the `ACCESS_KEY` variable and change it to a strong, unique passphrase. This key must be shared with your clients.

    ```python
    # server.py
    ACCESS_KEY = "Your_Secure_Passphrase_Here"
    ```

4.  **Start the Server**
    For a standard run:
    ```bash
    python server.py
    ```

    For background execution (Linux/AWS):
    ```bash
    nohup python3 -u server.py &
    ```
    *The server listens on port `8080` by default.*

---

## Development

To modify the client application or build it from the source:

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Run in Development Mode**
    ```bash
    npm start
    ```
    *In development mode, configuration files are stored within the project directory.*

3.  **Build for Production**
    ```bash
    npm run build
    ```
    *This generates an installer in the `dist/` directory using `electron-builder`.*

---

## A NOTE on Development & AI
This project was built with significant assistance from Large Language Models, as my main priority was to get it working quickly (voice chat + general structure was built in 4-5 hours) for use with my friends. As a result, code cleanliness and architectural best practices were not the primary focus, and you will likely encounter a fair amount of "spaghetti code" throughout the repository. I apologize for the messy implementation; the objective was simply to ensure the platform functions as intended for our use.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.