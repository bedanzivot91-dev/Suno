from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Iterable

SETTING_KEY = "song_finder_consensus_calibration_v1"


@dataclass(frozen=True)
class ConsensusThresholds:
    confirm_score: float = 72.0
    possible_score: float = 45.0
    min_confirm_engines: int = 2
    min_possible_engines: int = 1
    min_margin: float = 4.0
    sample_count: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "confirm_score": round(float(self.confirm_score), 1),
            "possible_score": round(float(self.possible_score), 1),
            "min_confirm_engines": int(self.min_confirm_engines),
            "min_possible_engines": int(self.min_possible_engines),
            "min_margin": round(float(self.min_margin), 1),
            "sample_count": int(self.sample_count),
        }


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, float(value)))


def _percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(float(value) for value in values)
    if len(ordered) == 1:
        return ordered[0]
    position = _clamp(fraction, 0.0, 1.0) * (len(ordered) - 1)
    lower = int(position)
    upper = min(len(ordered) - 1, lower + 1)
    weight = position - lower
    return ordered[lower] * (1.0 - weight) + ordered[upper] * weight


def load_thresholds(raw: str) -> ConsensusThresholds:
    try:
        payload = json.loads(str(raw or "{}"))
    except Exception:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    return ConsensusThresholds(
        confirm_score=_clamp(float(payload.get("confirm_score", 72.0)), 55.0, 92.0),
        possible_score=_clamp(float(payload.get("possible_score", 45.0)), 30.0, 80.0),
        min_confirm_engines=max(1, min(6, int(payload.get("min_confirm_engines", 2)))),
        min_possible_engines=max(1, min(6, int(payload.get("min_possible_engines", 1)))),
        min_margin=_clamp(float(payload.get("min_margin", 4.0)), 0.0, 30.0),
        sample_count=max(0, int(payload.get("sample_count", 0))),
    )


def _record_evidence(record: dict[str, Any]) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    expected_song_id = str(record.get("library_song_id") or "").strip()
    if not expected_song_id:
        return None, []
    result = record.get("result") or {}
    matches = result.get("matches") or []
    if not isinstance(matches, list):
        return None, []
    expected = None
    negatives: list[dict[str, Any]] = []
    for item in matches:
        if not isinstance(item, dict):
            continue
        if str(item.get("song_id") or "") == expected_song_id:
            if expected is None or float(item.get("audio_score") or 0) > float(expected.get("audio_score") or 0):
                expected = item
        else:
            negatives.append(item)
    return expected, negatives


def calibrate_from_records(records: Iterable[dict[str, Any]]) -> dict[str, Any]:
    positives: list[float] = []
    positive_engines: list[int] = []
    margins: list[float] = []
    usable_records: list[int] = []
    for record in records:
        expected, negatives = _record_evidence(record)
        if expected is None:
            continue
        positive_score = float(expected.get("audio_score") or 0)
        if positive_score <= 0:
            continue
        engine_count = max(1, int(expected.get("consensus_engine_count") or 0), len(expected.get("consensus_engines") or []))
        best_negative = max([float(item.get("audio_score") or 0) for item in negatives] or [0.0])
        positives.append(positive_score)
        positive_engines.append(engine_count)
        margins.append(max(0.0, positive_score - best_negative))
        usable_records.append(int(record.get("id") or 0))

    sample_count = len(positives)
    defaults = ConsensusThresholds()
    if sample_count == 0:
        return {
            "thresholds": defaults.as_dict(),
            "sample_count": 0,
            "record_ids": [],
            "reason": "Nema ručno potvrđenih Short/original parova sa sačuvanim score podacima.",
        }

    low_positive = _percentile(positives, 0.15)
    median_positive = _percentile(positives, 0.50)
    learned_confirm = _clamp(low_positive - 3.0, 58.0, 86.0)
    learned_possible = _clamp(min(learned_confirm - 12.0, median_positive * 0.72), 35.0, 70.0)
    learned_margin = _clamp(_percentile(margins, 0.20) * 0.55, 2.0, 14.0)
    learned_engines = max(1, min(3, int(round(_percentile([float(v) for v in positive_engines], 0.25)))))
    blend = min(1.0, sample_count / 8.0)
    thresholds = ConsensusThresholds(
        confirm_score=(defaults.confirm_score * (1.0 - blend)) + (learned_confirm * blend),
        possible_score=(defaults.possible_score * (1.0 - blend)) + (learned_possible * blend),
        min_confirm_engines=(defaults.min_confirm_engines if sample_count < 3 else min(defaults.min_confirm_engines, learned_engines)),
        min_possible_engines=1,
        min_margin=(defaults.min_margin * (1.0 - blend)) + (learned_margin * blend),
        sample_count=sample_count,
    )
    return {
        "thresholds": thresholds.as_dict(),
        "sample_count": sample_count,
        "record_ids": usable_records,
        "positive_scores": [round(value, 1) for value in positives],
        "positive_engine_counts": positive_engines,
        "margins": [round(value, 1) for value in margins],
        "reason": "Pragovi su konzervativno prilagođeni ručno potvrđenim Short/original parovima. Sa manje od osam parova zadržan je dio fabričkih pragova.",
    }
