-- Pin search_path on two pure helper functions (security advisor 0011).
-- Both are IMMUTABLE value mappings that read no tables; behaviour is
-- unchanged. Non-destructive: no data, grants or signatures change.
alter function public._tx_source(text, text, text, text, boolean) set search_path = public;
alter function public._profit_adjustment_source(text) set search_path = public;
