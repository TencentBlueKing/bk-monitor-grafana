import { getTemplateSrv } from '../../templating/template_srv';

export interface TargetItem {
  label: string;
  value: string;
}

export interface QueryData {
  expression: string;        // 查询表达式
  alias: string;             // 查询结果的别名
  display: boolean;          // 是否显示查询结果
  query_configs: QueryConfig[];  // 查询配置数组
  refId: string;             // 查询的引用 ID
  host: TargetItem[];        // 目标主机数组
  module: TargetItem[];      // 目标模块数组
  cluster: TargetItem[];     // 目标集群数组
  only_promql?: boolean;     // 是否仅使用 PromQL 查询语言
  source?: string;           // 数据源
  expressionList?: ExpresionItem[];  // 表达式项数组
}
export interface ExpresionItem {
  expression: string;
  functions: FunctionItem[];
  alias: string;
  active: boolean;
}

export interface QueryConfig {
  data_source_label: string;
  data_type_label: string;
  data_label: string;
  result_table_label: string;
  filter_dict: {};
  functions: FunctionItem[];
  group_by: string[];
  interval: number | 'auto';
  interval_unit: string;
  metric_field: string;
  method: string;
  alias: string;
  refId: string;
  display: boolean;
  result_table_id: string;
  time_field: string;
  index_set_id?: string;
  query_string?: string;
  where: ConditionItem[];
}
export interface ConditionItem {
  key: string;
  method: string;
  value: string[];
  condition?: string;
}
export interface FunctionParam {
  id: string;
  name?: string;
  default?: string | number;
  value: string | number;
  edit?: boolean;
  shortlist?: string[] | number[];
}
export interface FunctionItem {
  id: string;
  name?: string;
  children?: FunctionItem[];
  params?: FunctionParam[];
  description?: string;
  key?: string;
}
export const handleTransformOldQuery = (data: any) => {
  const [dataSourceTypeLabel, index_set_id, resultTableId, metricField] = data?.metric?.id;
  const dataSourceLabel = dataSourceTypeLabel?.replace(/(_|\.)(log|event|time_series)$/, '');
  const config: any = [
    Object.assign(
      {},
      {
        data_source_label: dataSourceLabel, // 数据来源
        data_type_label: dataSourceTypeLabel?.replace(new RegExp(`^${dataSourceLabel}(_|.)`), ''), // 数据类型
        result_table_label: data?.monitorObject?.id, // 监控对象
        result_table_id: resultTableId, // 表名
        metric_field: metricField, // 指标名
        filter_dict: {},
        functions: handleTransformOldFunc(data), // 函数
        group_by: data.dimensions || [], // 维度
        interval: data.period, // 监控周期
        interval_unit: 's',
        method: data.method, // 方法
        refId: 'a', // 别名
        alias: data.alias,
        display: true,
        time_field: '',
        where: data.conditions.map(
          (item: any[]) =>
            item.reduce((pre: any, cur: any) => {
              pre[cur.type] = cur.value || [];
              return pre;
            }, {}) //
        ),
      },
      dataSourceLabel === 'bk_log_search' ? { index_set_id } : {}
    ),
  ];
  const newQuery: QueryData = {
    alias: '',
    expression: '', // 表达式
    display: false,
    refId: 'a',
    query_configs: config,
    ...handleTransformOldTarget(data),
  };
  return newQuery;
};
export const handleTransformOldTarget = (data: any) => {
  // 最早期版本
  if (data.target) {
    let host = [];
    host = data.target?.realValues?.map?.((set: string) => {
      if (data.monitorObject.groupId === 'hosts') {
        const idList = set.split('-');
        return {
          label: idList[1],
          value: set,
        };
      }
      return {
        bk_target_service_instance_id: set,
      };
    });
    return {
      host,
      module: [],
      cluster: [],
    };
  }
  let host = [];
  let module = [];
  let cluster = [];
  if (data.cluster) {
    cluster = data.cluster?.list || [];
  }
  if (data.module) {
    module = data.module?.list || [];
  }
  if (data.host) {
    host = data.host?.list || [];
  }
  return {
    host,
    module,
    cluster,
  };
};
export const handleTransformOldFunc = (data: any) => {
  const funcList: FunctionItem[] = [];
  if (data.func?.rank?.sort) {
    funcList.push({
      id: data.func.rank.sort === 'desc' ? 'top' : 'bottom',
      params: [
        {
          id: 'n',
          value: data.func.rank.limit,
        },
      ],
    });
  }
  if (data.offset) {
    funcList.push({
      id: 'time_shift',
      params: [
        {
          id: 'n',
          value: data.offset,
        },
      ],
    });
  }
  return funcList;
};
export const buildWhereVariables = (values: string[] | string) => {
  const valList: string[] = [];
  Array.isArray(values) &&
    values.forEach((val) => {
      if (String(val).match(/^\$/)) {
        getTemplateSrv().replace(val, {}, (v: string | string[]) => {
          if (v) {
            Array.isArray(v) ? valList.push(...v) : valList.push(v);
          } else {
            valList.push(val);
          }
        });
      } else {
        valList.push(val);
      }
    });
  return valList;
};
export const buildPromqlVariables = (promql: string) => {
  return  getTemplateSrv().replace(promql || '', {}, (value: any, variable: any, formatValue: any) => {
    if (Array.isArray(value)) {
      const v = value
        .map((v) => {
          const val = JSON.stringify(formatValue(v, 'regex', variable));
          return val.slice(1, val.length - 1);
        })
        .join('|');
      return value.length > 1 ? `(${v})` : v;
    }
    return formatValue(Array.isArray(value) ? value[0] : value, 'glob', variable);
  });
}
export const getMetricId = (
  data_source_label: string,
  data_type_label: string,
  metric_field: string,
  result_table_id: string,
  index_set_id?: string,
  bkmonitor_strategy_id?: string,
  custom_event_name?: string,
  alert_name?: string
) => {
  const metaId = data_source_label + '|' + data_type_label;
  switch (metaId) {
    case 'bk_monitor|time_series':
    case 'custom|time_series':
    case 'bk_data|time_series':
      return [data_source_label, result_table_id, metric_field].join('.');
    case 'bk_monitor|event':
      return [data_source_label, metric_field].join('.');
    case 'bk_monitor|log':
      return [data_source_label, data_type_label, result_table_id].join('.');
    case 'bk_monitor|alert':
      return [data_source_label, data_type_label, bkmonitor_strategy_id ?? metric_field].join('.');
    case 'custom|event':
      return [data_source_label, data_type_label, result_table_id, '*'].join('.');
    case 'bk_log_search|log':
      return `${data_source_label}.index_set.${index_set_id}`;
    case 'bk_log_search|log':
      return `${data_source_label}.index_set.${index_set_id}.${metric_field}`;
    case 'bk_fta|alert':
    case 'bk_fta|event':
      return [data_source_label, data_type_label, alert_name ?? metric_field].join('.');
  }
  return '';
};
 /**
  * @param inter 汇聚周期
  * @param unit 单位
  * @returns {number} 转换后的汇聚周期 单位固定 s
  */
export const repalceInterval = (inter: string | number, unit: string) => {
 let interval: string | number = inter;
 if (typeof interval === 'string' && interval !== 'auto') {
   interval = +getTemplateSrv().replace(interval)
     .replace(/(\d+)(.*)/, (match: string, p1: string, p2: string) => {
       let str: string | number = p1 || '10';
       switch (p2) {
         case 'm':
           str = +p1 * 60;
           break;
         case 'h':
           str = +p1 * 60 * 60;
           break;
         case 'd':
           str = +p1 * 60 * 60 * 24;
           break;
         case 'w':
           str = +p1 * 60 * 60 * 24 * 7;
           break;
         default:
           str = (+p1 || 10) * (unit === 'm' ? 60 : 1);
           break;
       }
       return str.toString();
     });
 } else if (typeof interval === 'number') {
   if (unit === 'm') {
     interval = interval * 60;
   }
 }
 return interval || (unit === 'm' ? 60 : 10);
}
