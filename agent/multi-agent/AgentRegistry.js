import { DEFAULT_SUBAGENT_PROFILES } from "./config.js";

function normalizeText(input) {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") return String(input.text || "");
  return String(input || "");
}

export class AgentRegistry {
  constructor(profiles = DEFAULT_SUBAGENT_PROFILES) {
    this.profiles = [...profiles];
  }

  listProfiles() {
    return [...this.profiles];
  }

  getProfile(profileId) {
    return this.profiles.find((profile) => profile.id === profileId) || null;
  }

  resolveProfiles(userInput, options = {}) {
    const text = normalizeText(userInput);

    const matched = this.profiles.filter((profile) => {
      if (typeof profile.enabledWhen !== "function") {
        return true;
      }
      try {
        return profile.enabledWhen(text, userInput, options) === true;
      } catch {
        return false;
      }
    });

    const maxAgents = Number.isFinite(options.maxAgents) ? options.maxAgents : 3;
    return matched.slice(0, Math.max(0, maxAgents));
  }
}

export { DEFAULT_SUBAGENT_PROFILES };
