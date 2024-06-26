import { FeatureLike } from 'ol/Feature';
import BaseLayer from 'ol/layer/Base';
import { Subject } from 'rxjs';

import { MapLayerHandler, MapLayerOptions } from '@grafana/data';
import { LayerElement } from 'app/core/components/Layers/types';

interface MapLayerState<TConfig = unknown> extends LayerElement {
  options: MapLayerOptions<TConfig>;
  handler: MapLayerHandler;
  layer: BaseLayer; // the openlayers instance
  onChange: (cfg: MapLayerOptions<TConfig>) => void;
  isBasemap?: boolean;
  mouseEvents: Subject<FeatureLike | undefined>;
}

export interface GeomapLayerHover {
  layer: MapLayerState;
  features: FeatureLike[];
};
