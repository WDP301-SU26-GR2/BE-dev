from app.inference import dedupe_text_vs_bubble, map_m109_class


def test_map_m109_class():
    assert map_m109_class("frame") == ("PANEL", "frame")
    assert map_m109_class("body") == ("CHARACTER", "body")
    assert map_m109_class("text") == ("SPEECH_BUBBLE", "text-block")
    assert map_m109_class("face") is None


def _r(rtype, subtype, x, y, w, h, conf=0.9):
    return {"type": rtype, "subtype": subtype, "bbox": {"x": x, "y": y, "width": w, "height": h}, "confidence": conf}


def test_dedupe_text_overlapping_bubble_keeps_bubble():
    text = _r("SPEECH_BUBBLE", "text-block", 0, 0, 100, 100)
    bubble = _r("SPEECH_BUBBLE", "bubble", 5, 5, 100, 100)
    far_text = _r("SPEECH_BUBBLE", "text-block", 500, 500, 50, 50)
    result = dedupe_text_vs_bubble([text, far_text], [bubble])
    subtypes = [r["subtype"] for r in result]
    assert "bubble" in subtypes and "text-block" in subtypes
    assert len(result) == 2
