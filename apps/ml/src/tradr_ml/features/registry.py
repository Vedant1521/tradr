import hashlib
import json
from typing import List, Callable
import pandas as pd
from tradr_ml.features.functions import apply_feature_pipeline

class FeatureSet:
    def __init__(self, name: str, version: str, pipeline_func: Callable[[pd.DataFrame], pd.DataFrame], params: dict = None):
        self.name = name
        self.version = version
        self.pipeline_func = pipeline_func
        self.params = params or {}
        self.hash = self._compute_hash()
        
    def _compute_hash(self) -> str:
        """Compute a deterministic hash of the feature set definition."""
        definition = {
            "name": self.name,
            "version": self.version,
            "params": self.params,
            # We can also add source code hash if we want strict versioning
        }
        # Sort keys to ensure deterministic hash
        def_json = json.dumps(definition, sort_keys=True)
        return hashlib.sha256(def_json.encode("utf-8")).hexdigest()[:16]
        
    def get_definition_json(self) -> dict:
        return {
            "name": self.name,
            "version": self.version,
            "params": self.params,
            "hash": self.hash
        }

    def apply(self, df: pd.DataFrame) -> pd.DataFrame:
        """Applies the feature pipeline to the input dataframe."""
        return self.pipeline_func(df)

# Default registry
FS_V1 = FeatureSet(
    name="fs_v1",
    version="1.0",
    pipeline_func=apply_feature_pipeline,
    params={"timeframe": "1m"}
)

REGISTRY = {
    FS_V1.hash: FS_V1,
    FS_V1.name: FS_V1
}

def get_feature_set(identifier: str) -> FeatureSet:
    """Retrieve a FeatureSet by its hash or name."""
    if identifier not in REGISTRY:
        raise ValueError(f"FeatureSet '{identifier}' not found in registry.")
    return REGISTRY[identifier]
