//Folder Structure
healthshare-backend/
├─ package.json
├─ server.js
├─ .env.example
├─ docker-compose.yml
├─ Dockerfile
├─ prisma/schema.prisma
├─ hardhat.config.js
├─ contracts/HealthShareAccess.sol
├─ scripts/deploy.js
└─ src/
   ├─ db.js
   ├─ routes/
   │  ├─ auth.js
   │  ├─ files.js
   │  ├─ share.js
   │  ├─ audit.js
   ├─ middleware/auth.js
   └─ utils/
      ├─ verifySignature.js
      └─ jwt.js

 //package.json
{
  "name": "healthshare-backend",
  "version": "1.0.0",
  "main": "server.js",
  "type": "module",
  "scripts": {
    "dev": "nodemon server.js",
    "start": "node server.js",
    "deploy": "npx hardhat run scripts/deploy.js --network mumbai"
  },
  "dependencies": {
    "@prisma/client": "^5.8.1",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "ethers": "^5.7.2",
    "express": "^4.18.2",
    "helmet": "^7.0.0",
    "jsonwebtoken": "^9.0.2",
    "morgan": "^1.10.0",
    "pg": "^8.11.3"
  },
  "devDependencies": {
    "hardhat": "^2.22.2",
    "nodemon": "^3.0.3",
    "prisma": "^5.8.1"
  }
}
// .env.example
PORT=4000
DATABASE_URL=postgresql://user:password@db:5432/healthshare
JWT_SECRET=replace_me_with_strong_secret
PRIVATE_KEY_FOR_DEPLOY=0xYOUR_PRIVATE_KEY
POLYGON_MUMBAI_RPC=https://rpc-mumbai.maticvigil.com

//docker-compose.yml
version: "3.8"

services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: healthshare
    ports:
      - "5432:5432"
    volumes:
      - db_data:/var/lib/postgresql/data

  backend:
    build: .
    ports:
      - "4000:4000"
    env_file: .env
    depends_on:
      - db
    command: npm run dev
    volumes:
      - .:/app

volumes:
  db_data:
// Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 4000
CMD ["npm", "run", "dev"]

// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String   @id @default(uuid())
  walletAddress String   @unique
  email         String?
  createdAt     DateTime @default(now())
  files         File[]
}

model File {
  id        String   @id @default(uuid())
  owner     String
  cid       String
  name      String
  key       String
  iv        String
  createdAt DateTime @default(now())
}

model Share {
  id        String   @id @default(uuid())
  cid       String
  from      String
  viewer    String
  expiry    BigInt
  signature String
  createdAt DateTime @default(now())
}

model AuditLog {
  id        String   @id @default(uuid())
  actor     String
  action    String
  fileId    String?
  timestamp DateTime @default(now())
}

// src/db.js
import { PrismaClient } from "@prisma/client";
export const db = new PrismaClient();

// src/middleware/auth.js
import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const { JWT_SECRET } = process.env;

export const verifyJWT = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

export const loginWithSignature = async (req, res) => {
  try {
    const { message, signature } = req.body;
    const walletAddress = ethers.utils.verifyMessage(message, signature);
    const token = jwt.sign({ walletAddress }, JWT_SECRET, { expiresIn: "2h" });
    res.json({ walletAddress, token });
  } catch (e) {
    res.status(400).json({ error: "Signature verification failed", details: e.message });
  }
};

// src/utils/verifySignature.js
import { ethers } from "ethers";
export function verifySignature(message, signature, expectedAddress) {
  try {
    const signerAddr = ethers.utils.verifyMessage(message, signature);
    return signerAddr.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

// src/utils/jwt.js
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

export const createJWT = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "2h" });

// src/routes/auth.js
import express from "express";
import { loginWithSignature } from "../middleware/auth.js";
const router = express.Router();

router.post("/metamask-login", loginWithSignature);
export default router;

// src/routes/files.js
import express from "express";
import { db } from "../db.js";
import { verifyJWT } from "../middleware/auth.js";
const router = express.Router();

router.post("/upload", verifyJWT, async (req, res) => {
  const { cid, name, key, iv } = req.body;
  try {
    const record = await db.file.create({
      data: { cid, name, key, iv, owner: req.user.walletAddress },
    });
    await db.auditLog.create({
      data: { actor: req.user.walletAddress, action: "UPLOAD", fileId: cid },
    });
    res.json({ success: true, record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/list", verifyJWT, async (req, res) => {
  const files = await db.file.findMany({
    where: { owner: req.user.walletAddress },
  });
  res.json(files);
});

export default router;

//src/routes/share.js
import express from "express";
import { db } from "../db.js";
import { verifyJWT } from "../middleware/auth.js";
import { verifySignature } from "../utils/verifySignature.js";
const router = express.Router();

router.post("/", verifyJWT, async (req, res) => {
  const { payload, signature } = req.body;
  const valid = verifySignature(JSON.stringify(payload), signature, req.user.walletAddress);
  if (!valid) return res.status(400).json({ error: "Invalid signature" });

  const share = await db.share.create({
    data: {
      cid: payload.cid,
      from: req.user.walletAddress,
      viewer: payload.viewer,
      expiry: BigInt(payload.expiry),
      signature,
    },
  });
  await db.auditLog.create({
    data: { actor: req.user.walletAddress, action: "SHARE_CREATED", fileId: payload.cid },
  });
  res.json({ success: true, share });
});

export default router;

// src/routes/audit.js
import express from "express";
import { db } from "../db.js";
import { verifyJWT } from "../middleware/auth.js";
const router = express.Router();

router.get("/", verifyJWT, async (req, res) => {
  const logs = await db.auditLog.findMany({
    where: { actor: req.user.walletAddress },
    orderBy: { timestamp: "desc" },
  });
  res.json(logs);
});

export default router;

// server.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";

import authRoutes from "./src/routes/auth.js";
import fileRoutes from "./src/routes/files.js";
import shareRoutes from "./src/routes/share.js";
import auditRoutes from "./src/routes/audit.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));

app.get("/", (req, res) => res.send("🏥 HealthShare backend running"));

app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/share", shareRoutes);
app.use("/api/audit", auditRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));

// Smart Contract
// contracts/HealthShareAccess.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract HealthShareAccess {
    address public admin;
    mapping(bytes32 => address) public ownerOf;
    mapping(bytes32 => mapping(address => uint256)) public expiry;

    event AccessGranted(bytes32 indexed cidHash, address indexed owner, address indexed viewer, uint256 expiry);
    event AccessRevoked(bytes32 indexed cidHash, address indexed owner, address indexed viewer);
    event ConsentLogged(bytes32 indexed cidHash, address indexed user, string researchId);

    constructor() {
        admin = msg.sender;
    }

    function registerOwner(bytes32 cidHash) public {
        ownerOf[cidHash] = msg.sender;
    }

    function grantAccess(bytes32 cidHash, address viewer, uint256 until) public {
        require(ownerOf[cidHash] == msg.sender, "Not owner");
        expiry[cidHash][viewer] = until;
        emit AccessGranted(cidHash, msg.sender, viewer, until);
    }

    function revokeAccess(bytes32 cidHash, address viewer) public {
        require(ownerOf[cidHash] == msg.sender, "Not owner");
        expiry[cidHash][viewer] = 0;
        emit AccessRevoked(cidHash, msg.sender, viewer);
    }

    function checkAccess(bytes32 cidHash, address viewer) public view returns (bool) {
        return block.timestamp <= expiry[cidHash][viewer];
    }

    function logConsent(bytes32 cidHash, string memory researchId) public {
        require(ownerOf[cidHash] == msg.sender, "Not owner");
        emit ConsentLogged(cidHash, msg.sender, researchId);
    }
}

// hardhat.config.js
import dotenv from "dotenv";
dotenv.config();
import "@nomiclabs/hardhat-ethers";

export default {
  solidity: "0.8.17",
  networks: {
    hardhat: {},
    mumbai: {
      url: process.env.POLYGON_MUMBAI_RPC,
      accounts: [process.env.PRIVATE_KEY_FOR_DEPLOY],
    },
  },
};

// scripts/deploy.js
import { ethers } from "hardhat";

async function main() {
  const Contract = await ethers.getContractFactory("HealthShareAccess");
  const contract = await Contract.deploy();
  await contract.deployed();
  console.log("✅ Deployed to:", contract.address);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

