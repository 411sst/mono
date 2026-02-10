const REQUIRED_SINGLETONS = ["Start", "Jail", "GoToJail"];

export function validateMap(map) {
  const issues = [];
  if (!map?.id || !map?.name || !Array.isArray(map?.spaces)) {
    issues.push("Map must include id, name, and spaces array");
    return { ok: false, issues };
  }

  const indexes = map.spaces.map((s) => s.index);
  const uniqueIndexes = new Set(indexes);
  if (uniqueIndexes.size !== map.spaces.length) issues.push("Space indexes must be unique");

  for (let i = 0; i < map.spaces.length; i++) {
    if (!uniqueIndexes.has(i)) issues.push(`Space index ${i} is unreachable/missing`);
  }

  for (const singleton of REQUIRED_SINGLETONS) {
    const count = map.spaces.filter((s) => s.type === singleton).length;
    if (count !== 1) issues.push(`Map must contain exactly one ${singleton} space`);
  }

  const groupCounts = {};
  for (const space of map.spaces) {
    if (space.type === "Property") {
      if (!space.group) issues.push(`${space.name} missing group`);
      if (!space.price || space.price < 50 || space.price > 500) issues.push(`${space.name} has invalid price range`);
      if (!Array.isArray(space.rent) || space.rent.some((v, i) => i > 0 && v <= space.rent[i - 1])) {
        issues.push(`${space.name} rent tiers must strictly increase`);
      }
      groupCounts[space.group] = (groupCounts[space.group] || 0) + 1;
    }
  }

  for (const [group, config] of Object.entries(map.groups || {})) {
    if (groupCounts[group] !== config.size) {
      issues.push(`Group ${group} expected ${config.size} properties, got ${groupCounts[group] || 0}`);
    }
  }

  if (Object.keys(groupCounts).length < 2) issues.push("Balanced property distribution requires at least two groups");

  return { ok: issues.length === 0, issues };
}
