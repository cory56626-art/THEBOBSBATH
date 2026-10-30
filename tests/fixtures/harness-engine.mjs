import { Chess } from 'chess.js';
import { FEATURE_NAMES } from './controller.js';

export const ENGINE_VERSION = 'test-harness-snapshot';
export const featureNames = FEATURE_NAMES;
export const legalMoves = fen => new Chess(fen).moves();
