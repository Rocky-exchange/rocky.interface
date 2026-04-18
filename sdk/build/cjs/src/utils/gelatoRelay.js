"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.gelatoRelay = void 0;
const relay_sdk_1 = require("@gelatonetwork/relay-sdk");
const noop_1 = __importDefault(require("lodash/noop"));
exports.gelatoRelay = new relay_sdk_1.GelatoRelay();
exports.gelatoRelay.onError(noop_1.default);
