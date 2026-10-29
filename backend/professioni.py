import re
from difflib import get_close_matches

BASES = {
    "Ingegnere": ["ingegnere", "ing", "ingegniere", "ingegnera", "ingeniere", "ingegneria", "ingeg", "ingegn"],
    "Architetto": ["architetto", "arch", "architetta", "architettura", "archit", "architeto"],
    "Geometra": ["geometra", "geom", "geometri", "geomentra"],
    "Perito": ["perito", "periti", "perita", "p.i", "pi", "per"],
}
SEED_SPECS = ["civile", "edile", "elettrico", "elettronico", "elettrotecnico", "meccanico", "gestionale", "ambientale", "informatico",
              "strutturista", "energetico", "chimico", "industriale", "agrario", "idraulico", "aerospaziale", "biomedico", "navale",
              "edile-architetto", "junior", "termotecnico", "agronomo", "forestale", "minerario", "nucleare", "paesaggista",
              "urbanista", "delle telecomunicazioni", "dei materiali", "per l'ambiente e il territorio", "edile"]
STOP = {"in", "di", "del", "della", "dott", "dr", "dottore", "dottoressa", "sono", "un", "una", "lo", "la", "il", "libero", "professionista"}
ALIAS_TO_BASE = {a: b for b, aliases in BASES.items() for a in aliases}
ALIASES_LONG = [a for a in ALIAS_TO_BASE if len(a) >= 5]


def _base_of(token: str):
    t = token.strip(".,;:-")
    if t in ALIAS_TO_BASE:
        return ALIAS_TO_BASE[t]
    if len(t) >= 5:
        for a in ALIASES_LONG:
            if t.startswith(a[:6]) and len(a) >= 6:
                return ALIAS_TO_BASE[a]
        m = get_close_matches(t, ALIASES_LONG, n=1, cutoff=0.72)
        if m:
            return ALIAS_TO_BASE[m[0]]
    return None


def _fix_word(w: str, vocab: list):
    if len(w) < 4 or w in vocab:
        return w
    m = get_close_matches(w, vocab, n=1, cutoff=0.8)
    return m[0] if m else w


def normalize(raw, learned_specs=()):
    """Return (professione, base, spec) from free text with typos/abbreviations."""
    if not raw or not str(raw).strip():
        return None, None, None
    s = str(raw).lower().replace("p.i.", "perito industriale ").replace("p. i.", "perito industriale ")
    s = re.sub(r"[./_]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    tokens = s.split(" ")
    base, idx = None, -1
    for i, t in enumerate(tokens):
        b = _base_of(t)
        if b:
            base, idx = b, i
            break
    if not base:
        clean = str(raw).strip()
        return clean[:1].upper() + clean[1:], None, None
    rest = [t for t in tokens[idx + 1:] if t and t not in STOP and not _base_of(t)]
    vocab_words = sorted({w for sp in list(SEED_SPECS) + list(learned_specs) for w in sp.split()})
    spec = " ".join(_fix_word(w, vocab_words) for w in rest).strip() or None
    if base == "Perito" and spec == "i":
        spec = "industriale"
    return (f"{base} {spec}" if spec else base), base, spec
