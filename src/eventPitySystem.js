"use strict";

const BASE_EVENT_CHANCE = 0.45;
const EVENT_CHANCE_STEP = 0.2;
const MAX_EVENT_CHANCE = 1;
const EVENT_DEPTH_STEP = 4;

function shouldCheckEvent(depth, runState = {}) {
  return depth >= (runState.nextEventDepth || EVENT_DEPTH_STEP);
}

function getEventTriggerChance(runState = {}) {
  const misses = Math.max(0, runState.eventMissCount || 0);
  return Math.min(MAX_EVENT_CHANCE, BASE_EVENT_CHANCE + misses * EVENT_CHANCE_STEP);
}

function rollEventTrigger(runState = {}, random = Math.random) {
  return random() < getEventTriggerChance(runState);
}

function updateEventState(triggered, runState = {}) {
  return {
    ...runState,
    eventMissCount: triggered ? 0 : Math.max(0, runState.eventMissCount || 0) + 1,
    nextEventDepth: (runState.nextEventDepth || EVENT_DEPTH_STEP) + EVENT_DEPTH_STEP
  };
}

module.exports = {
  BASE_EVENT_CHANCE,
  EVENT_CHANCE_STEP,
  EVENT_DEPTH_STEP,
  MAX_EVENT_CHANCE,
  getEventTriggerChance,
  rollEventTrigger,
  shouldCheckEvent,
  updateEventState
};
