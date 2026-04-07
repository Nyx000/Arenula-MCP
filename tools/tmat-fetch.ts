#!/usr/bin/env node
/**
 * tmat-fetch — Pull PBR textures from Poly Haven or ambientCG and generate
 * s&box .terrain_material (.tmat) files ready to drop into your project.
 *
 * Requires Node 18+ (built-in fetch). No extra dependencies.
 *
 * Usage:
 *   npx tsx tools/tmat-fetch.ts rock
 *   npx tsx tools/tmat-fetch.ts snow --resolution 2k --out C:/MyProject/materials/terrain/
 *   npx tsx tools/tmat-fetch.ts sand --source ambientcg --limit 5
 *   npx tsx tools/tmat-fetch.ts --list
 *   npx tsx tools/tmat-fetch.ts --id grass_path_2
 *   npx tsx tools/tmat-fetch.ts --id Rock027 --source ambientcg
 *   npx tsx tools/tmat-fetch.ts ground --all --resolution 1k
 */

import * as fs from "fs";
import * as path from "path";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";

// ── Types ────────────────────────────────────────────────────────────────────

interface TmatConfig {
  AlbedoImage: string;
  RoughnessImage: string;
  NormalImage: string;
  HeightImage: string;
  AOImage: string;
  UVScale: number;
  UVRotation: number;
  Metalness: number;
  NormalStrength: number;
  HeightBlendStrength: number;
  Surface: string;
  __references: string[];
  __version: number;
}

// ── Surface mapping ──────────────────────────────────────────────────────────

const SURFACE_MAP: [string, string][] = [
  ["rock",     "surfaces/rock.surface"],
  ["stone",    "surfaces/rock.surface"],
  ["cliff",    "surfaces/rock.surface"],
  ["gravel",   "surfaces/gravel.surface"],
  ["pebble",   "surfaces/gravel.surface"],
  ["sand",     "surfaces/sand.surface"],
  ["beach",    "surfaces/sand.surface"],
  ["snow",     "surfaces/snow.surface"],
  ["ice",      "surfaces/snow.surface"],
  ["mud",      "surfaces/mud.surface"],
  ["clay",     "surfaces/mud.surface"],
  ["grass",    "surfaces/grass.surface"],
  ["moss",     "surfaces/grass.surface"],
  ["concrete", "surfaces/concrete.surface"],
  ["asphalt",  "surfaces/concrete.surface"],
  ["wood",     "surfaces/wood.surface"],
  ["bark",     "surfaces/dirt.surface"],
];

function getSurface(terms: string[]): string {
  const lower = terms.join(" ").toLowerCase();
  for (const [key, surface] of SURFACE_MAP) {
    if (lower.includes(key)) return surface;
  }
  return "surfaces/dirt.surface";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function arg(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

async function getJSON(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await pipeline(res.body as any, createWriteStream(dest));
}

function writeTmat(slug: string, outDir: string, textures: Partial<Record<string, string>>, surface: string, projectRoot?: string): string {
  const root = projectRoot ? path.resolve(projectRoot) : process.cwd();
  const rel = (p: string | undefined, fallback: string) => {
    if (!p) return fallback;
    const abs = path.resolve(p);
    const relative = path.relative(root, abs).replace(/\\/g, "/");
    return relative;
  };

  const config: TmatConfig = {
    AlbedoImage:         rel(textures.albedo,  "materials/default/default.vmat"),
    RoughnessImage:      rel(textures.rough,   "materials/default/default_rough.tga"),
    NormalImage:         rel(textures.normal,  "materials/default/default_normal.tga"),
    HeightImage:         rel(textures.disp,    "materials/default/default_ao.tga"),
    AOImage:             rel(textures.ao,      "materials/default/default_ao.tga"),
    UVScale:             2,
    UVRotation:          0,
    Metalness:           0,
    NormalStrength:      1,
    HeightBlendStrength: 1.5,
    Surface:             surface,
    __references:        [],
    __version:           0,
  };

  fs.mkdirSync(outDir, { recursive: true });
  const tmatPath = path.join(outDir, `${slug}.tmat`);
  fs.writeFileSync(tmatPath, JSON.stringify(config, null, 2));
  return tmatPath;
}

// ── Poly Haven ───────────────────────────────────────────────────────────────

const PH = "https://api.polyhaven.com";

interface PHAsset {
  name: string;
  categories: string[];
  tags: string[];
  download_count: number;
}

async function phCategories(): Promise<string[]> {
  const data: Record<string, PHAsset> = await getJSON(`${PH}/assets?type=textures`);
  const cats = new Set<string>();
  for (const a of Object.values(data)) a.categories.forEach(c => cats.add(c));
  return [...cats].sort();
}

async function phSearch(category: string, limit: number): Promise<Record<string, PHAsset>> {
  const url = category
    ? `${PH}/assets?type=textures&categories=${encodeURIComponent(category)}`
    : `${PH}/assets?type=textures`;
  const all: Record<string, PHAsset> = await getJSON(url);
  if (limit <= 0) return all;
  return Object.fromEntries(Object.entries(all).slice(0, limit));
}

async function phDownload(slug: string, resolution: string, outDir: string): Promise<Partial<Record<string, string>>> {
  const files = await getJSON(`${PH}/files/${slug}`);
  const res = resolution;

  // Structure: files[MapType][resolution][format].url
  // Map type names vary: "Diffuse", "nor_gl", "Rough", "AO", "Displacement", "arm"
  const pick = (keys: string[], fmt = "jpg") => {
    for (const k of keys) {
      const u = files[k]?.[res]?.[fmt]?.url ?? files[k]?.["1k"]?.[fmt]?.url;
      if (u) return u;
    }
    return undefined;
  };

  const urls: Record<string, string | undefined> = {
    albedo: pick(["Diffuse", "diff", "col"]),
    normal: pick(["nor_gl", "nor_dx"]),
    rough:  pick(["Rough", "rough"]),
    ao:     pick(["AO", "ao"]),
    disp:   pick(["Displacement", "disp", "Height"]),
  };

  const downloaded: Partial<Record<string, string>> = {};
  for (const [mapType, url] of Object.entries(urls)) {
    if (!url) continue;
    const ext  = url.split(".").pop() ?? "jpg";
    const dest = path.join(outDir, `${slug}_${mapType}.${ext}`);
    process.stdout.write(`  ↓ ${slug}_${mapType}.${ext} ... `);
    try {
      await downloadFile(url, dest);
      process.stdout.write("✓\n");
      downloaded[mapType] = dest.replace(/\\/g, "/");
    } catch (e: any) {
      process.stdout.write(`✗ ${e.message}\n`);
    }
  }
  return downloaded;
}

// ── ambientCG ─────────────────────────────────────────────────────────────

const ACG = "https://ambientcg.com/api/v2/full_json";

async function acgSearch(category: string, limit: number): Promise<any[]> {
  const params = new URLSearchParams({
    include: "downloadData",
    type:    "PhotoTexturePBR",
    category,
    limit:   String(limit),
    offset:  "0",
  });
  const data = await getJSON(`${ACG}?${params}`);
  return data.foundAssets ?? [];
}

async function acgDownload(asset: any, resolution: string, outDir: string): Promise<Partial<Record<string, string>>> {
  const resKey  = resolution.toUpperCase();
  const folder  = asset.downloadFolders?.[resKey] ?? asset.downloadFolders?.["1K"];
  const zipInfo = folder?.downloadFiletypeCategories?.PNG?.downloads?.[0]
                ?? folder?.downloadFiletypeCategories?.JPG?.downloads?.[0];

  if (!zipInfo) {
    console.warn(`  [skip] No download found for ${asset.assetId} at ${resolution}`);
    return {};
  }

  // Download ZIP
  const zipDest = path.join(outDir, `${asset.assetId}_${resKey}.zip`);
  process.stdout.write(`  ↓ ${path.basename(zipDest)} (ZIP) ... `);
  try {
    await downloadFile(zipInfo.downloadLink, zipDest);
    process.stdout.write("✓\n");
  } catch (e: any) {
    process.stdout.write(`✗ ${e.message}\n`);
    return {};
  }

  // Extract ZIP using Node built-ins if possible, otherwise instruct user
  try {
    const { execSync } = await import("child_process");
    const extractDir = path.join(outDir, asset.assetId);
    fs.mkdirSync(extractDir, { recursive: true });
    execSync(`tar -xf "${zipDest}" -C "${extractDir}"`, { stdio: "pipe" });
    fs.unlinkSync(zipDest);

    // Map extracted files to texture types
    const files = fs.readdirSync(extractDir);
    const find  = (...terms: string[]) => {
      const f = files.find(f => terms.some(t => f.toLowerCase().includes(t.toLowerCase())));
      return f ? path.join(extractDir, f).replace(/\\/g, "/") : undefined;
    };

    return {
      albedo: find("Color", "Diffuse", "Albedo"),
      normal: find("NormalGL", "Normal_GL", "NormalDX", "Normal"),
      rough:  find("Roughness"),
      ao:     find("AmbientOcclusion", "AO"),
      disp:   find("Displacement", "Height"),
    };
  } catch {
    console.log(`  ⚠  Extract ZIP manually: ${zipDest}`);
    console.log(`     Then re-run --id ${asset.assetId} --source ambientcg`);
    return {};
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args    = process.argv.slice(2);
  const source   = arg(args, "--source")     ?? "polyhaven";
  const id       = arg(args, "--id");
  const res      = arg(args, "--resolution") ?? "1k";
  const outDir   = arg(args, "--out")        ?? "./materials/terrain/";
  const project  = arg(args, "--project");   // s&box project root; defaults to cwd
  const limit    = parseInt(arg(args, "--limit") ?? "0");
  const all      = args.includes("--all");
  const listCats = args.includes("--list") || args.includes("--list-categories");
  const category = args.find(a => !a.startsWith("--") && a !== arg(args, "--source") && a !== arg(args, "--id") && a !== arg(args, "--resolution") && a !== arg(args, "--out") && a !== arg(args, "--limit")) ?? "";

  // ── List categories ──
  if (listCats) {
    if (source === "ambientcg") {
      const cats = ["Rock","Ground","Gravel","Sand","Snow","Ice","Mud","Moss","Concrete","Asphalt","Wood","Bark","Grass","Terrain"];
      console.log("ambientCG categories:\n  " + cats.join("\n  "));
    } else {
      console.log("Fetching Poly Haven categories...");
      const cats = await phCategories();
      console.log("Poly Haven texture categories:\n  " + cats.join("\n  "));
    }
    return;
  }

  if (!id && !category) {
    console.log("Usage:");
    console.log("  npx tsx tools/tmat-fetch.ts rock");
    console.log("  npx tsx tools/tmat-fetch.ts snow --resolution 2k --out C:/MyProject/materials/terrain/");
    console.log("  npx tsx tools/tmat-fetch.ts --list");
    console.log("  npx tsx tools/tmat-fetch.ts --id grass_path_2");
    console.log("  npx tsx tools/tmat-fetch.ts --id Rock027 --source ambientcg");
    console.log("  npx tsx tools/tmat-fetch.ts ground --all --limit 10");
    console.log("\nSources: polyhaven (default) | ambientcg");
    process.exit(0);
  }

  const abs = path.resolve(outDir);

  // ── Single asset by ID ──
  if (id) {
    console.log(`\nDownloading ${id} from ${source} @ ${res} → ${abs}`);
    let textures: Partial<Record<string, string>>;
    let surface = "surfaces/dirt.surface";

    if (source === "ambientcg") {
      const results = await acgSearch(id, 1);
      const asset   = results.find((a: any) => a.assetId.toLowerCase() === id.toLowerCase());
      if (!asset) { console.error(`Asset ${id} not found on ambientCG`); process.exit(1); }
      textures = await acgDownload(asset, res, abs);
      surface  = getSurface([asset.displayCategory ?? "", ...( asset.tags ?? [])]);
    } else {
      textures = await phDownload(id, res, abs);
      const info: Record<string, PHAsset> = await getJSON(`${PH}/assets?type=textures`);
      surface  = getSurface([...(info[id]?.categories ?? []), ...(info[id]?.tags ?? [])]);
    }

    if (textures.albedo) {
      const tmat = writeTmat(id, abs, textures, surface, project);
      console.log(`\n✓ Generated ${tmat}`);
    } else {
      console.warn("\n⚠  No albedo texture found — .tmat not written");
    }
    return;
  }

  // ── Category search & batch download ──
  console.log(`\nSearching ${source} for "${category}" @ ${res} ...`);

  let assets: { slug: string; name: string; categories: string[]; tags: string[] }[] = [];

  if (source === "ambientcg") {
    const raw = await acgSearch(category, limit > 0 ? limit : 20);
    assets    = raw.map((a: any) => ({
      slug:       a.assetId,
      name:       a.assetId,
      categories: [a.displayCategory ?? ""],
      tags:       a.tags ?? [],
    }));
  } else {
    const raw  = await phSearch(category, limit);
    assets     = Object.entries(raw).map(([slug, a]) => ({
      slug,
      name:       a.name,
      categories: a.categories,
      tags:       a.tags,
    }));
  }

  if (assets.length === 0) {
    console.log("No assets found.");
    return;
  }

  // Preview list
  console.log(`\nFound ${assets.length} assets:\n`);
  assets.forEach((a, i) => {
    console.log(`  [${String(i + 1).padStart(2)}] ${a.slug.padEnd(40)} ${a.categories.join(", ")}`);
  });

  if (!all) {
    console.log(`\nAdd --all to download all, or --id <slug> to pick one.`);
    console.log(`Example: npx tsx tools/tmat-fetch.ts ${category} --all --limit 5 --out ${outDir}`);
    return;
  }

  // Batch download
  console.log(`\nDownloading ${assets.length} assets → ${abs}\n`);
  let ok = 0;
  for (const asset of assets) {
    console.log(`[${asset.slug}]`);
    let textures: Partial<Record<string, string>>;

    if (source === "ambientcg") {
      const raw = await acgSearch(asset.slug, 1);
      textures  = raw[0] ? await acgDownload(raw[0], res, path.join(abs, asset.slug)) : {};
    } else {
      textures = await phDownload(asset.slug, res, path.join(abs, asset.slug));
    }

    if (textures.albedo) {
      const surface = getSurface([...asset.categories, ...asset.tags]);
      const tmat    = writeTmat(asset.slug, abs, textures, surface, project);
      console.log(`  ✓ ${path.basename(tmat)}\n`);
      ok++;
    } else {
      console.log(`  ⚠  skipped (no albedo)\n`);
    }
  }

  console.log(`Done — ${ok}/${assets.length} .tmat files written to ${abs}`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
