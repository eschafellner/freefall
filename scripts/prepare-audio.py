#!/usr/bin/env python3
"""Prepare the CC0 game masters from the inputs recorded in audio-sources.json."""
import argparse
from array import array
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
RATE = 32000
OUT = ROOT / "apps/client/public/audio"
SOURCES = ROOT / "docs/audio-sources.json"

# id, source ID, offset, seconds, high-pass, low-pass, integrated LUFS, overlap (seconds), channels
LOOPS = [
    ("ice-bed", 792516, 16, 123, 83, 4900, -23, 3.0, 2),
    ("ice-wind", 754256, 24, 62, 115, 5700, -24, 2.5, 2),
    ("desert-bed", 187756, 18, 148, 95, 4600, -24, 3.4, 2),
    ("desert-wind", 697217, 0.1, 40, 155, 7200, -24, 2.8, 2),
    ("plains-bed", 529573, 3, 79, 120, 7200, -25, 2.8, 2),
    ("plains-wind", 639459, 11, 107, 120, 4900, -25, 3.2, 2),
    ("forest-bed", 523389, 5, 125, 85, 5200, -24, 3.2, 2),
    ("forest-wind", 403051, 3, 74, 145, 6200, -24, 2.7, 2),
    ("carrier", "carrier-rumble", 3, 74, 42, 1600, -25, 2.3, 2),
    ("lander", "kenney-engine", .05, 4.85, 49, 3200, -20, .55, 1),
    ("recovery", "rocket-engine", .1, 5.8, 49, 2300, -20, .63, 1),
]

# id prefix, source ID, search window, duration incl. pre-roll, high and low pass, integrated LUFS, take count
CUTS = [
    ("snow", 773736, (5, 55), .54, 125, 7000, -22, 4),
    ("ice", 732880, (1, 10), .53, 110, 7500, -22, 4),
    ("sand", 852213, (0, 24), .49, 110, 6300, -24, 4),
    ("grass", 521587, (0, 4.3), .53, 96, 7200, -22, 4),
    ("dirt", 264469, (1, 14), .52, 100, 6100, -22, 4),
    ("rock", 264469, (14, 25.8), .51, 165, 8200, -22, 4),
    ("ice-crack", 213579, (3, 42), 1.4, 75, 6800, -24, 3),
    ("desert-grit", 852213, (9, 23), 1.3, 215, 5600, -25, 3),
    ("grass-rustle", 767220, (1, 19), 1.3, 170, 6900, -26, 3),
    ("wood-crack", 434555, (2, 51), 1.3, 90, 7200, -24, 3),
    ("schabe-hiss", "monster-snarl", (0, 17.55), .64, 125, 5800, -17, 3),
]

# Single authored takes. Individual surface files are windowed by their strongest transient below.
ONE_SHOTS = [
    ("radio", "kenney-radio", 0, .55, 300, 3900, -21, 0, 1),
    ("confirm", "kenney-confirm", 0, .49, 260, 4150, -19, 0, 1),
    ("hull-impact", "kenney-metal", 0, 1.1, 85, 4100, -18, 0, 1),
    *[(f"schabe-chitter-{n}", f"bug-0{n}", 0, .68, 165, 5300, -22, 0, 1) for n in range(1, 4)],
    *[(f"schabe-impact-{n}", f"spit-0{n}", 0, .75, 93, 5900, -19, 0, 1) for n in range(1, 3)],
]
LEAVES = [(f"forest-floor-{n}", f"leaves-0{n}", (0, 2), .51, 110, 6650, -23, 1) for n in range(1, 5)]

# id, target RMS, layers (source ID, start, length, trim filters, placement in finished sample)
WEAPON_CUTS = [
    ("kestrel-shot-1", -19, [("weapon-d31", .495, .226, 52, 13000, 0)]),
    ("kestrel-shot-2", -19, [("weapon-d30", .495, .226, 52, 13000, 0)]),
    ("kestrel-shot-distant", -23, [("weapon-d23", .521, .24, 64, 5400, 0)]),
    ("p01-shot-1", -21, [("weapon-x39", 1.402, .184, 76, 13500, 0)]),
    ("p01-shot-2", -21, [("weapon-x39-alt", 6.441, .184, 76, 13500, 0)]),
    ("p01-shot-distant", -24, [("weapon-x31", 5.238, .236, 88, 5500, 0)]),
    ("kestrel-mag-out", -25, [("weapon-d5", 1.218, .239, 135, 10700, 0)]),
    ("kestrel-mag-in", -24, [("weapon-d4", 1.254, .15, 118, 10500, 0)]),
    ("kestrel-reload-finish", -27, [("weapon-d13", .35, .15, 130, 10100, 0)]),
    ("p01-mag-out", -26, [("weapon-x5", 1.35, .16, 155, 10500, 0)]),
    ("p01-mag-in-slide", -25, [("weapon-x4", .874, .132, 140, 11200, 0), ("weapon-x17", 1.145, .125, 140, 11200, .076)]),
    ("weapon-switch-foley", -29, [("weapon-switch-source", 2.375, .144, 115, 8500, 0)]),
    ("weapon-casing-hard", -31, [("weapon-casing-source", .11, .142, 420, 10800, 0)]),
]


def ffmpeg(args, data=None):
    return subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-y", *map(str, args)], input=data,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)


def tone(path, start, length, low, high, channels):
    result = ffmpeg(["-v", "error", "-ss", start, "-i", path, "-t", length, "-af",
                     f"highpass=f={low},lowpass=f={high}", "-ar", RATE, "-ac", channels,
                     "-f", "f32le", "pipe:1"])
    return array("f", result.stdout)


def seam(samples, overlap, channels):
    size = min(round(overlap * RATE), len(samples) // (channels * 3))
    result = samples[size * channels:-size * channels]
    for frame in range(size):
        # Complementary smoothstep: correlated wind does not get a 3 dB boost.
        t = frame / (size - 1)
        fade = t * t * (3 - 2 * t)
        for channel in range(channels):
            a = frame * channels + channel
            result.append(samples[len(samples) - size * channels + a] * (1 - fade) + samples[a] * fade)
    return result


def cut_edges(samples, channels):
    fade_in = min(RATE // 100, len(samples) // (channels * 4))
    fade_out = min(round(RATE * .09), len(samples) // (channels * 3))
    for n in range(fade_in * channels):
        samples[n] *= (n // channels) / fade_in
    for n in range(fade_out * channels):
        samples[-1 - n] *= (n // channels) / fade_out
    return samples


def transients(samples, duration, count):
    hop = RATE // 100
    peaks = [(sum(value * value for value in samples[i:i + hop]), i)
             for i in range(0, len(samples) - hop, hop)]
    window = round(duration * RATE)
    before = round(.095 * RATE)
    selected = []
    for _, peak in sorted(peaks, reverse=True):
        start = max(0, min(peak - before, len(samples) - window))
        if all(abs(start - prev) >= window for prev in selected):
            selected.append(start)
            if len(selected) == count:
                return sorted(selected)
    raise ValueError("Input too short for requested distinct takes")


def loudness(pcm, channels):
    input_args = ["-f", "f32le", "-ar", RATE, "-ac", channels, "-i", "pipe:0"]
    result = ffmpeg([*input_args, "-af", "loudnorm=print_format=json", "-f", "null", "-"], pcm)
    details = json.loads(re.findall(r"\{[^{}]+\}", result.stderr.decode())[-1])
    return float(details["input_i"]), float(details["input_tp"]), float(details["input_lra"])


def encode(name, samples, channels, target, source_id, start, raw_length, low, high, overlap):
    pcm = samples.tobytes()
    integrated, peak, lra = loudness(pcm, channels)
    gain = min(target - integrated, -3.5 - peak, 20) if math.isfinite(integrated) else min(-5 - peak, 14)
    formats = {}
    for extension, codec in [("ogg", ["-c:a", "libvorbis", "-q:a", "4"]),
                             ("mp3", ["-c:a", "libmp3lame", "-q:a", "3"])]:
        file = OUT / f"{name}.{extension}"
        ffmpeg(["-v", "error", "-f", "f32le", "-ar", RATE, "-ac", channels, "-i", "pipe:0", "-af",
                f"volume={gain:.5f}dB", *codec, "-map_metadata", "-1", file], pcm)
        formats[extension] = hashlib.sha256(file.read_bytes()).hexdigest()
    return {"id": name, "source": source_id, "start": round(start, 4), "sourceSeconds": round(raw_length, 4),
            "seconds": round(len(samples) / (RATE * channels), 4), "channels": channels, "hpfHz": low, "lpfHz": high,
            "crossfade": overlap, "gainDb": round(gain, 2), "targetLufs": target,
            "lufs": round(integrated + gain, 2) if math.isfinite(integrated) else None, "peakDbtp": round(peak + gain, 2),
            "lra": lra, "sha256": formats}


def prepare(inputs, catalog, job):
    path = inputs / catalog[str(job[1])]['file']
    if len(job) == 9:
        name, source, start, length, lo, hi, target, overlap, channels = job
        samples = tone(path, start, length, lo, hi, channels)
        duration = len(samples) / (RATE * channels)
        pcm = seam(samples, overlap, channels) if overlap else cut_edges(samples, channels)
        return [encode(name, pcm, channels, target, source, start, duration, lo, hi, overlap)]
    name, source, (start, end), length, lo, hi, target, count = job
    samples = tone(path, start, end - start, lo, hi, 1)
    return [
        encode(name if count == 1 else f"{name}-{index + 1}", cut_edges(samples[offset:offset + round(length * RATE)], 1),
               1, target, source, start + offset / RATE, length, lo, hi, 0)
        for index, offset in enumerate(transients(samples, length, count))
    ]


def prepare_weapon(inputs, catalog, job):
    name, target, layers = job
    sample_count = round(max(length + offset for _, _, length, _, _, offset in layers) * RATE)
    samples = array("f", [0.0]) * sample_count
    for source, start, length, low, high, offset in layers:
        entry = catalog[source]
        path = inputs / entry["file"]
        # A symmetric downmix leaves room for the two microphone perspectives to sum at the transient.
        args = ["-v", "error", "-ss", start, "-i", path, "-t", length]
        channel = entry.get("selectedChannel")
        if channel is not None:
            mono = f"pan=mono|c0=c{channel},"
        else:
            mono = "pan=mono|c0=0.5*c0+0.5*c1," if entry["channels"] == 2 else ""
        # PPQ take two has three isolated full-scale samples on its cleanest microphone.
        # Repair them before resampling, where they would spread to neighbouring samples.
        repair = "adeclip=w=10:o=75:a=8:t=2," if entry.get("repairIsolatedPeaks") else ""
        result = ffmpeg([*args, "-af", f"{mono}{repair}highpass=f={low},lowpass=f={high}",
                         "-ar", RATE, "-ac", "1", "-f", "f32le", "pipe:1"])
        clip = array("f", result.stdout)
        edge_in, edge_out = round(.002 * RATE), round(.033 * RATE)
        shift = round(offset * RATE)
        for i, value in enumerate(clip):
            samples[shift + i] += value * min(1, i / edge_in, (len(clip) - 1 - i) / edge_out)

    peak = 20 * math.log10(max(abs(value) for value in samples))
    rms = 10 * math.log10(sum(value * value for value in samples) / len(samples))
    gain = min(target - rms, -6 - peak, 14)
    formats = {}
    for extension, codec in [("ogg", ["-c:a", "libvorbis", "-q:a", "4"]),
                             ("mp3", ["-c:a", "libmp3lame", "-q:a", "3"])]:
        file = OUT / f"{name}.{extension}"
        ffmpeg(["-v", "error", "-f", "f32le", "-ar", RATE, "-ac", 1, "-i", "pipe:0", "-af",
                f"volume={gain:.5f}dB", *codec, "-map_metadata", "-1", file], samples.tobytes())
        formats[extension] = hashlib.sha256(file.read_bytes()).hexdigest()
    return {"id": name, "source": layers[0][0], "category": "weapon",
            "layers": [{"source": source, "start": start, "seconds": length, "hpfHz": low, "lpfHz": high, "offset": offset}
                       for source, start, length, low, high, offset in layers],
            "seconds": round(sample_count / RATE, 4), "channels": 1, "crossfade": 0,
            "gainDb": round(gain, 2), "rmsDbfs": round(rms + gain, 2), "peakDbfs": round(peak + gain, 2), "sha256": formats}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inputs", type=Path, help="Directory with the documented source files and archive members")
    parser.add_argument("--weapons", action="store_true", help="Prepare only the 7.9A.1 one-shots")
    args = parser.parse_args()
    source_catalog = json.loads(SOURCES.read_text())
    source_catalog = {key: entry for key, entry in source_catalog.items() if (entry["category"] == "weapon") == args.weapons}
    for source, entry in source_catalog.items():
        path = args.inputs / entry["file"]
        if hashlib.sha256(path.read_bytes()).hexdigest() != entry["sha256"]:
            raise ValueError(f"Source hash differs: {path}")
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = ROOT / "docs/audio-masters.json"
    cached = json.loads(manifest.read_text()) if manifest.exists() else []
    if args.weapons:
        catalog = [asset for asset in cached if asset.get("category") != "weapon"]
        catalog.extend(prepare_weapon(args.inputs, source_catalog, job) for job in WEAPON_CUTS)
        manifest.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n")
        print(f"Prepared {len(WEAPON_CUTS)} weapon masters in two runtime formats.")
        return
    with ThreadPoolExecutor(max_workers=4) as workers:
        results = list(workers.map(lambda job: prepare(args.inputs, source_catalog, job), [*LOOPS, *CUTS, *ONE_SHOTS, *LEAVES]))
    catalog = [asset for group in results for asset in group]
    catalog.extend(asset for asset in cached if asset.get("category") == "weapon")
    manifest.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n")
    print(f"Prepared {len(catalog)} audio masters in two runtime formats.")


if __name__ == "__main__":
    main()
