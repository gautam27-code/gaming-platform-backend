# 🎮 Gaming Platform Backend

This repository contains the backend code for a scalable, multiplayer gaming platform. Built with Node.js, Express, MongoDB, and Socket.io, it supports both single-player and multiplayer game modes, user authentication, real-time gameplay, stats tracking, and leaderboards.

---

## 🚀 Features

- **User Authentication:** JWT-based login, registration, and secure user profile management.
- **Game Rooms:** Create multiplayer rooms, join games, and play in real-time.
- **Single-Player and Multiplayer Modes:** Play vs AI or other users in games like Tic-Tac-Toe.
- **Real-time Gameplay:** Socket.io for live game events, moves, and player readiness.
- **Stats & Leaderboards:** Track matches played, wins, losses, win rate, and global ranking. View top players.
- **Friends System:** Send/accept friend requests and manage your friends list.
- **RESTful API:** Organized endpoints for authentication, user management, games, and leaderboards.
- **Error Handling:** Centralized error middleware for robust API responses.
- **Secure:** Passport.js strategies for JWT and local authentication; CORS configured for safe API access.

---

## 🗂️ Directory Structure

```
src/
  app.js                 # Entry point and main Express app
  config/
    database.js          # MongoDB connection
    passport.js          # Passport strategies (JWT & Local)
  controllers/           # API request handlers
  models/
    user.model.js        # User schema & methods
    game.model.js        # Game schema
  routes/
    auth.routes.js       # Auth endpoints
    user.routes.js       # User & leaderboard endpoints
    game.routes.js       # Game room/gameplay endpoints
  middleware/
    auth.middleware.js   # Auth helpers
    error.middleware.js  # Error handling
```

---

## ⚡ Quick Start

1. **Clone the repo:**
   ```bash
   git clone https://github.com/gautam27-code/gaming-platform-backend.git
   cd gaming-platform-backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment setup:**
   - Create a `.env` file at the root with the following (change values as needed):
     ```
     PORT=5000
     MONGO_URI=mongodb://localhost:27017/gaming-platform
     JWT_SECRET=your_jwt_secret
     ```

4. **Run the server:**
   ```bash
   npm start
   ```
   This will start the server at the specified port (default: 5000).

---

## 📚 API Overview

### Auth (`/api/auth`)
- `POST /register` — Register a new user
- `POST /login` — Login and receive JWT
- `GET /profile` — Get current user profile (protected)
- `PUT /status` — Update user's online status

### User (`/api/users`)
- `GET /profile/:id` — Get profile by user ID
- `PUT /stats` — Update user stats
- `POST /friends/request` — Send friend request
- `PUT /friends/request` — Accept/reject friend request
- `GET /friends` — Get friends list
- `GET /leaderboard` — Get top players

### Game (`/api/games`)
- `POST /rooms` — Create multiplayer room
- `POST /single-player` — Start single-player game
- `GET /rooms` — List available rooms
- `POST /rooms/:roomCode/join` — Join a room
- `GET /:gameId` — Get game state
- `POST /:gameId/move` — Make a move
- `PUT /:gameId/ready` — Set player ready status

---

## 🛡️ Tech Stack

- **Node.js & Express** — Server & APIs
- **MongoDB & Mongoose** — Database & ODM
- **Passport.js** — Authentication (JWT & Local)
- **Socket.io** — Real-time game communication
- **bcryptjs** — Password hashing
- **morgan** — Logging
- **dotenv** — Environment variables

---

## 🏆 Contributing

Pull requests and improvements are welcome! Please fork the repo and submit your changes via PR.

---

## 📄 License

MIT

---

## 🙋‍♂️ Maintainers
**Gautam Jain**
**Chetan Bansal**
**Bhumika Jindal**

---

## ✨ Fun Fact

We love exploring new technologies and making multiplayer gaming more fun for everyone!
