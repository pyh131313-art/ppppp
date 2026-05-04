"use strict";

function cleanEnvValue(value) {
  if (!value) return "";
  return value
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/;+$/g, "")
    .trim();
}

module.exports = {
  cleanEnvValue
};
