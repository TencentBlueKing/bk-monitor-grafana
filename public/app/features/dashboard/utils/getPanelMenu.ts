import { t } from '@lingui/macro';
import {cloneDeep} from 'lodash';

import { PanelMenuItem } from '@grafana/data';
import { AngularComponent, locationService } from '@grafana/runtime';
import { PanelCtrl } from 'app/angular/panel/panel_ctrl';
// import config from 'app/core/config';
import { DashboardModel } from 'app/features/dashboard/state/DashboardModel';
import { PanelModel } from 'app/features/dashboard/state/PanelModel';
import {
  addLibraryPanel,
  copyPanel,
  duplicatePanel,
  removePanel,
  sharePanel,
  toggleLegend,
  unlinkLibraryPanel,
} from 'app/features/dashboard/utils/panel';
import { isPanelModelLibraryPanel } from 'app/features/library-panels/guard';
// import { store } from 'app/store/store';

// import { contextSrv } from '../../../core/services/context_srv';
// import { getExploreUrl } from '../../../core/utils/explore';
// import { navigateToExplore } from '../../explore/state/main';
import { getTemplateSrv } from '../../templating/template_srv';
import { getTimeSrv } from '../services/TimeSrv';

import { handleTransformOldQuery, buildWhereVariables, QueryData, QueryConfig, getMetricId, buildPromqlVariables, repalceInterval } from './transfrom-targets';
const bkmonitorDatasource = ['bkmonitor-timeseries-datasource', 'bkmonitor-event-datasource'];
const isEnLang = !!document.cookie?.includes('blueking_language=en')
declare global {
  interface Window {
    grafanaBootData: any;
    graphWatermark: boolean;
  }
}
interface ParamItem {
  dataList: any[];
  queryString: string;
}
export function getPanelMenu(
  dashboard: DashboardModel,
  panel: PanelModel,
  angularComponent?: AngularComponent | null
): PanelMenuItem[] {
  const onViewPanel = (event: React.MouseEvent<any>) => {
    event.preventDefault();
    locationService.partial({
      viewPanel: panel.id,
    });
  };

  const onEditPanel = (event: React.MouseEvent<any>) => {
    event.preventDefault();
    locationService.partial({
      editPanel: panel.id,
    });
  };

  const onSharePanel = (event: React.MouseEvent<any>) => {
    event.preventDefault();
    sharePanel(dashboard, panel);
  };

  const onToggleLegend = (event: React.MouseEvent<any>) => {
    event.preventDefault();
    toggleLegend(panel);
  };

  const onAddLibraryPanel = (event: React.MouseEvent<any>) => {
    event.preventDefault();
    addLibraryPanel(dashboard, panel);
  };

  const onUnlinkLibraryPanel = (event: React.MouseEvent<any>) => {
    event.preventDefault();
    unlinkLibraryPanel(panel);
  };

  const onInspectPanel = (tab?: string) => {
    locationService.partial({
      inspect: panel.id,
      inspectTab: tab,
    });
  };

  const onMore = (event: React.MouseEvent<any>) => {
    event.preventDefault();
  };

  const onDuplicatePanel = (event: React.MouseEvent<any>) => {
    event.preventDefault();
    duplicatePanel(dashboard, panel);
  };

  const onCopyPanel = (event: React.MouseEvent<any>) => {
    event.preventDefault();
    copyPanel(panel);
  };

  const onRemovePanel = (event: React.MouseEvent<any>) => {
    event.preventDefault();
    removePanel(dashboard, panel, true);
  };

  // const onNavigateToExplore = (event: React.MouseEvent<any>) => {
  //   event.preventDefault();
  //   const openInNewWindow =
  //     event.ctrlKey || event.metaKey ? (url: string) => window.open(`${config.appSubUrl}${url}`) : undefined;
  //   store.dispatch(navigateToExplore(panel, { getDataSourceSrv, getTimeSrv, getExploreUrl, openInNewWindow }) as any);
  // };
  const buildUrlParams = (targetList: any[]): ParamItem => {
    const dataList: any[] = [];
    let metriIdMap: Record<string, string> = {};
    targetList.forEach((item: any) => {
      let data: QueryData = cloneDeep(item);
      if (item?.data?.metric?.id?.length > 3) {
        data = handleTransformOldQuery(item.data);
      }
      data.query_configs.forEach((config) => {
        config.where = config.where?.map((set) => ({
          ...set,
          value: buildWhereVariables(set.value),
        }));
        config.functions = config.functions?.filter?.((item) => item.id && !['top', 'bottom'].includes(item.id))
          .map(func => ({
            ...func,
            params: func.params?.map(set => ({
              ...set,
              value: typeof set.value === 'string'
                ? getTemplateSrv().replace(set.value)
                : set.value,
            })),
          })) || [];
        config.interval = repalceInterval(config.interval, config.interval_unit);
        config.interval_unit = 's'
        const metriId = getMetricId(
          config.data_source_label,
          config.data_type_label,
          config.metric_field,
          config.data_label || config.result_table_id,
          config.index_set_id
        );
        metriId && (metriIdMap[metriId] = 'set');
        // metriId && (queryString += `${queryString.length ? ' or ' : ''}指标ID : ${metriId}`)
      });
      if (data.expression?.length) {
        data.expressionList = [
          {
            expression: data.expression,
            active: data.display,
            functions: [],
            alias: data.alias,
          },
        ];
      }
      if(data.source?.length) {
        data.source = buildPromqlVariables(data.source)
      }
      const { alias, display, expression, ...props } = data;
      dataList.push(props);
    });
    let queryString = '';
    Object.keys(metriIdMap).forEach((metricId) => {
      queryString += `${queryString.length ? ' or ' : ''}指标ID : ${metricId}`;
    });
    return {
      dataList,
      queryString,
    };
  };
  //  添加策略事件
  const onAddStrategy = (event: React.MouseEvent<any>) => {
    event.preventDefault();
    const targetList = (panel.targets as any[]).filter((target) => target && !target.hide);
    if (targetList.length > 1) {
      return;
    }
    const { dataList } = buildUrlParams(targetList);
    console.info('新增策略参数：', dataList);
    if (dataList?.length) {
      const monitorUrl = `${location.href.split('/grafana')[0]}/?bizId=${
        (window.grafanaBootData as any).user.orgName
      }#/strategy-config/add?data=${encodeURIComponent(JSON.stringify(dataList[0]))}`;
      console.info(monitorUrl);
      window.open(monitorUrl);
    }
  };
  //  数据检索事件
  const onDataRetrieval = (event: React.MouseEvent<any>) => {
    event.preventDefault();
    const targetList = (panel.targets as any[]).filter((target) => target && !target.hide);
    const { dataList } = buildUrlParams(targetList);
    const dataItem = dataList?.[0].query_configs?.[0];
    let monitorRoutePath = 'data-retrieval';
    if (dataItem) {
      if (dataItem.data_type_label === 'time_series') {
        monitorRoutePath = 'data-retrieval';
      } else if (
        dataItem.data_type_label === 'event' ||
        (dataItem.data_type_label === 'log' && dataItem.data_source_label === 'bk_monitor')
      ) {
        monitorRoutePath = 'event-retrieval';
      } else if (dataItem.data_type_label === 'log') {
        // 跳转日志检索
        monitorRoutePath = 'log-retrieval';
      }
    }
    console.info('数据检索参数：', dataList);
    if (dataList?.length) {
      const monitorUrl = `${location.href.split('/grafana')[0]}/?bizId=${
        (window.grafanaBootData as any).user.orgName
      }#/${monitorRoutePath}?targets=${encodeURIComponent(JSON.stringify(dataList.map((item) => ({ data: item }))))}`;
      console.info(monitorUrl);
      window.open(monitorUrl);
    }
  };
  const onRelateAlert = (event: React.MouseEvent<any>) => {
    event.preventDefault();
    const targetList = (panel.targets as any[]).filter((target) => target && !target.hide);
    const { queryString } = buildUrlParams(targetList);
    // console.info(dataList);
    if (queryString.length) {
      const {
        time: { from, to },
      } = getTimeSrv();
      const monitorUrl = `${location.href.split('/grafana')[0]}/?bizId=${
        (window.grafanaBootData as any).user.orgName
      }#/event-center?queryString=${queryString}&from=${from?.format?.('YYYY-MM-DD HH:mm:ss') || from}&to=${
        to?.format?.('YYYY-MM-DD HH:mm:ss') || to
      }`;
      // console.info(monitorUrl);
      window.open(monitorUrl);
    }
  };
  const menu: PanelMenuItem[] = [];

  if (!panel.isEditing) {
    const viewTextTranslation = t({
      id: 'panel.header-menu.view',
      message: `View`,
    });
    menu.push({
      text: viewTextTranslation,
      iconClassName: 'eye',
      onClick: onViewPanel,
      shortcut: 'v',
    });
  }

  if (dashboard.canEditPanel(panel) && !panel.isEditing) {
    menu.push({
      text: 'Edit',
      iconClassName: 'edit',
      onClick: onEditPanel,
      shortcut: 'e',
    });
  }

  const shareTextTranslation = t({
    id: 'panel.header-menu.share',
    message: `Share`,
  });

  menu.push({
    text: shareTextTranslation,
    iconClassName: 'share-alt',
    onClick: onSharePanel,
    shortcut: 'p s',
  });

  // if (contextSrv.hasAccessToExplore() && !(panel.plugin && panel.plugin.meta.skipDataQuery)) {
  //   menu.push({
  //     text: 'Explore',
  //     iconClassName: 'compass',
  //     onClick: onNavigateToExplore,
  //     shortcut: 'x',
  //   });
  // }

  menu.push({
    text: panel.options.legend?.showLegend ? 'Hide legend' : 'Show legend',
    iconClassName: 'exchange-alt',
    onClick: onToggleLegend,
    shortcut: 'p l',
  });

  const inspectMenu: PanelMenuItem[] = [];

  // Only show these inspect actions for data plugins
  if (panel.plugin && !panel.plugin.meta.skipDataQuery) {
    const dataTextTranslation = t({
      id: 'panel.header-menu.inspect-data',
      message: `Data`,
    });

    inspectMenu.push({
      text: dataTextTranslation,
      onClick: (e: React.MouseEvent<any>) => onInspectPanel('data'),
    });

    if (dashboard.meta.canEdit) {
      inspectMenu.push({
        text: 'Query',
        onClick: (e: React.MouseEvent<any>) => onInspectPanel('query'),
      });
    }
  }

  const jsonTextTranslation = t({
    id: 'panel.header-menu.inspect-json',
    message: `Panel JSON`,
  });

  inspectMenu.push({
    text: jsonTextTranslation,
    onClick: (e: React.MouseEvent<any>) => onInspectPanel('json'),
  });

  const inspectTextTranslation = t({
    id: 'panel.header-menu.inspect',
    message: `Inspect`,
  });
  menu.push({
    type: 'submenu',
    text: inspectTextTranslation,
    iconClassName: 'info-circle',
    onClick: (e: React.MouseEvent<any>) => onInspectPanel(),
    shortcut: 'i',
    subMenu: inspectMenu,
  });

  const subMenu: PanelMenuItem[] = [];

  if (dashboard.canEditPanel(panel) && !(panel.isViewing || panel.isEditing)) {
    subMenu.push({
      text: 'Duplicate',
      onClick: onDuplicatePanel,
      shortcut: 'p d',
    });

    subMenu.push({
      text: 'Copy',
      onClick: onCopyPanel,
    });
    if (isPanelModelLibraryPanel(panel)) {
      subMenu.push({
        text: 'Unlink library panel',
        onClick: onUnlinkLibraryPanel,
      });
    } else {
      subMenu.push({
        text: 'Create library panel',
        onClick: onAddLibraryPanel,
      });
    }
  }
  if (dashboard.canEditPanel(panel)) { 
    // add custom menu 添加策略 、 数据检索
    if (
      !window.is_external &&
      dashboard.canEditPanel(panel) &&
      panel.targets.length &&
      panel.targets.every(
        (item: any) => bkmonitorDatasource.includes(item.datasourceId) || item?.query_configs?.length > 0 || item?.source?.length > 10
      )
    ) {
      const onlyPromql = panel.targets.some((item: any) => item.only_promql);
      const hasMetric =  panel.targets.some((item: any) => item.query_configs?.length)
      if (panel.targets.length < 2 && !onlyPromql) {
        let canSetStrategy = hasMetric;
        // 监控时序多指标策略
        if ((panel.targets[0] as QueryData)?.query_configs?.length > 1) {
          const [{ query_configs }] = panel.targets as QueryData[];
          const hasSpecialCMDBDimension = (data: QueryConfig) => {
            return (
              data.data_source_label === 'bk_monitor' &&
              data.data_type_label === 'time_series' &&
              (data.group_by.some((dim) => ['bk_inst_id', 'bk_obj_id'].includes(dim)) ||
                data.where.some((condition) => ['bk_inst_id', 'bk_obj_id'].includes(condition.key)))
            );
          };
          canSetStrategy = query_configs.every((item) => {
            return (
              ['bk_monitor|time_series', 'custom|time_series'].includes(
                `${item.data_source_label}|${item.data_type_label}`
              ) &&
              !item.result_table_id.match(/^uptimecheck/i) &&
              !hasSpecialCMDBDimension(item)
            );
          });
        }
        canSetStrategy &&
          menu.push({
            text: !isEnLang ? '添加策略' : 'Add Rule',
            iconClassName: 'fa fa-fw fa-road',
            onClick: onAddStrategy,
          });
      }
      !onlyPromql &&
        menu.push({
          text: !isEnLang ? '数据检索' : 'Explore',
          iconClassName: 'fa fa-fw fa-signal',
          onClick: onDataRetrieval,
        });
        hasMetric && menu.push({
        text: !isEnLang ? '相关告警' : 'Related Alarms',
        iconClassName: 'fa fa-fw fa-exclamation-triangle',
        onClick: onRelateAlert,
      });
    }
  }
  // add old angular panel options
  if (angularComponent) {
    const scope = angularComponent.getScope();
    const panelCtrl: PanelCtrl = scope.$$childHead.ctrl;
    const angularMenuItems = panelCtrl.getExtendedMenu();

    for (const item of angularMenuItems) {
      const reactItem: PanelMenuItem = {
        text: item.text,
        href: item.href,
        shortcut: item.shortcut,
      };

      if (item.click) {
        reactItem.onClick = () => {
          scope.$eval(item.click, { ctrl: panelCtrl });
        };
      }

      subMenu.push(reactItem);
    }
  }

  if (!panel.isEditing && subMenu.length) {
    const moreTextTranslation = t({
      id: 'panel.header-menu.more',
      message: `More...`,
    });
    menu.push({
      type: 'submenu',
      text: moreTextTranslation,
      iconClassName: 'cube',
      subMenu,
      onClick: onMore,
    });
  }

  if (dashboard.canEditPanel(panel) && !panel.isEditing && !panel.isViewing) {
    menu.push({ type: 'divider', text: '' });

    menu.push({
      text: 'Remove',
      iconClassName: 'trash-alt',
      onClick: onRemovePanel,
      shortcut: 'p r',
    });
  }

  return menu;
}
