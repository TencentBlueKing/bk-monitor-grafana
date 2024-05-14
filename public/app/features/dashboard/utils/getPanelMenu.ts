import {cloneDeep} from 'lodash';

import {
  getTimeZone,
  PanelMenuItem,
  PluginExtensionPoints,
  urlUtil,
  type PluginExtensionPanelContext,
  DateTime,
} from '@grafana/data';
import { AngularComponent, getPluginLinkExtensions, locationService } from '@grafana/runtime';
import { PanelCtrl } from 'app/angular/panel/panel_ctrl';
import { t } from 'app/core/internationalization';
import { contextSrv } from 'app/core/services/context_srv';
import { panelToRuleFormValues } from 'app/features/alerting/unified/utils/rule-form';
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
import { DashboardInteractions } from 'app/features/dashboard-scene/utils/interactions';
import { InspectTab } from 'app/features/inspector/types';
import { isPanelModelLibraryPanel } from 'app/features/library-panels/guard';
import { createExtensionSubMenu } from 'app/features/plugins/extensions/utils';

import { getCreateAlertInMenuAvailability } from '../../alerting/unified/utils/access-control';
// import { navigateToExplore } from '../../explore/state/main';
import { getTemplateSrv } from '../../templating/template_srv'
import { getTimeSrv } from '../services/TimeSrv';

import { handleTransformOldQuery, buildWhereVariables, QueryData, getMetricId, buildPromqlVariables, repalceInterval } from './transfrom-targets';
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
  const buildUrlParams = (targetList: any[]): ParamItem => {
    const dataList: any[] = [];
    let metriIdMap: Record<string, string> = {};
    targetList.forEach((item: any) => {
      let data: QueryData = cloneDeep(item);
      if (item?.data?.metric?.id?.length > 3) {
        data = handleTransformOldQuery(item.data);
      }
      data.query_configs?.forEach?.((config) => {
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
        if(item.mode !== 'code') {
          const metriId = getMetricId(
            config.data_source_label,
            config.data_type_label,
            config.metric_field,
            config.data_label || config.result_table_id,
            config.index_set_id
          );
          metriId && (metriIdMap[metriId] = 'set');
        }
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
  const onAddStrategy = (target: any) => {
    const { dataList } = buildUrlParams([target]);
    console.info('新增策略参数：', dataList);
    if (dataList?.length) {
      const [dataItem] = dataList
      let monitorUrl = ''
      // promql
      if(dataItem?.mode === 'code' && dataItem?.source?.length) {
        monitorUrl =  `${location.href.split('/grafana')[0]}/?bizId=${
          (window.grafanaBootData as any).user.orgName
        }#/strategy-config/add?mode=code&data=${encodeURIComponent(JSON.stringify({
          mode: 'code',
          data: [{
            promql: dataItem.source,
            step: dataItem.step || 60
          }]
        }))}`;
      } else {
         monitorUrl = `${location.href.split('/grafana')[0]}/?bizId=${
          (window.grafanaBootData as any).user.orgName
        }#/strategy-config/add?data=${encodeURIComponent(JSON.stringify(dataList[0]))}`;
      }
      console.info(monitorUrl);
      window.open(monitorUrl);
    }
  };
  //  数据检索事件
  const onDataRetrieval = (target: any) => {
    const { dataList } = buildUrlParams([target]);
    const dataItem = dataList?.[0].query_configs?.[0];
    let monitorRoutePath = 'data-retrieval';
    if (dataItem) {
      if (target?.mode === 'code' || dataItem.data_type_label === 'time_series') {
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
  const onRelateAlert = (target: any) => {
    const { queryString, dataList } = buildUrlParams([target]);
    // console.info(dataList);
    if (queryString.length || dataList?.length) {
      const {
        time: { from, to },
      } = getTimeSrv();
      const monitorUrl = `${location.href.split('/grafana')[0]}/?bizId=${
        (window.grafanaBootData as any).user.orgName
      }#/event-center?queryString=${encodeURIComponent(queryString)}&promql=${target.mode === 'code' && dataList[0]?.source ? encodeURIComponent(dataList[0].source) : ''}&from=${(from as DateTime)?.format?.('YYYY-MM-DD HH:mm:ss') || from}&to=${
        (to as DateTime)?.format?.('YYYY-MM-DD HH:mm:ss') || to
      }`;
      console.info(monitorUrl);
      window.open(monitorUrl);
    }
  };
  const onViewPanel = (event: React.MouseEvent) => {
    event.preventDefault();
    locationService.partial({
      viewPanel: panel.id,
    });
    DashboardInteractions.panelMenuItemClicked('view');
  };

  const onEditPanel = (event: React.MouseEvent) => {
    event.preventDefault();
    locationService.partial({
      editPanel: panel.id,
    });

    DashboardInteractions.panelMenuItemClicked('edit');
  };

  const onSharePanel = (event: React.MouseEvent) => {
    event.preventDefault();
    sharePanel(dashboard, panel);
    DashboardInteractions.panelMenuItemClicked('share');
  };

  const onAddLibraryPanel = (event: React.MouseEvent) => {
    event.preventDefault();
    addLibraryPanel(dashboard, panel);
    DashboardInteractions.panelMenuItemClicked('createLibraryPanel');
  };

  const onUnlinkLibraryPanel = (event: React.MouseEvent) => {
    event.preventDefault();
    unlinkLibraryPanel(panel);
    DashboardInteractions.panelMenuItemClicked('unlinkLibraryPanel');
  };

  const onInspectPanel = (tab?: InspectTab) => {
    locationService.partial({
      inspect: panel.id,
      inspectTab: tab,
    });
    DashboardInteractions.panelMenuInspectClicked(tab ?? InspectTab.Data);
  };

  const onMore = (event: React.MouseEvent) => {
    event.preventDefault();
  };

  const onDuplicatePanel = (event: React.MouseEvent) => {
    event.preventDefault();
    duplicatePanel(dashboard, panel);
    DashboardInteractions.panelMenuItemClicked('duplicate');
  };

  const onCopyPanel = (event: React.MouseEvent) => {
    event.preventDefault();
    copyPanel(panel);
    DashboardInteractions.panelMenuItemClicked('copy');
  };

  const onRemovePanel = (event: React.MouseEvent) => {
    event.preventDefault();
    removePanel(dashboard, panel, true);
    DashboardInteractions.panelMenuItemClicked('remove');
  };

  // const onNavigateToExplore = (event: React.MouseEvent) => {
  //   event.preventDefault();
  //   const openInNewWindow =
  //     event.ctrlKey || event.metaKey ? (url: string) => window.open(`${config.appSubUrl}${url}`) : undefined;
  //   store.dispatch(
  //     navigateToExplore(panel, {
  //       timeRange: getTimeSrv().timeRange(),
  //       getExploreUrl,
  //       openInNewWindow,
  //     }) as any
  //   );
  //   DashboardInteractions.panelMenuItemClicked('explore');
  // };

  const onToggleLegend = (event: React.MouseEvent) => {
    event.preventDefault();
    toggleLegend(panel);
    DashboardInteractions.panelMenuItemClicked('toggleLegend');
  };

  const menu: PanelMenuItem[] = [];

  if (!panel.isEditing) {
    menu.push({
      text: t('panel.header-menu.view', `View`),
      iconClassName: 'eye',
      onClick: onViewPanel,
      shortcut: 'v',
    });
  }

  if (dashboard.canEditPanel(panel) && !panel.isEditing) {
    menu.push({
      text: t('panel.header-menu.edit', `Edit`),
      iconClassName: 'edit',
      onClick: onEditPanel,
      shortcut: 'e',
    });
  }
  menu.push({
    text: t('panel.header-menu.share', `Share`),
    iconClassName: 'share-alt',
    onClick: onSharePanel,
    shortcut: 'p s',
  });
  if (dashboard.canEditPanel(panel)) { 
    // add custom menu 添加策略 、 数据检索
    if (
      !window.is_external &&
      dashboard.canEditPanel(panel) &&
      panel.targets.length
    ) {
      const targetList = panel.targets.filter((target) => target && !target.hide).map((item: any) => {
        let data: QueryData = cloneDeep(item);
        // 处理老版本数据
        if (item.data?.metric?.id?.length > 3) {
          data = handleTransformOldQuery(item.data);
        }
        return {
          ...data,
          mode: (item.mode === 'code' || item.only_promql) ? 'code' : 'ui',
          refId: item.refId
        };
      });
      const strategySubMenu: PanelMenuItem[] = [];
      const dataRetrievalSubMenu: PanelMenuItem[] = [];
      const alertSubMenu: PanelMenuItem[] = [];
      targetList.forEach((target: any) => {
        if(target?.datasource?.type) {
          if(!bkmonitorDatasource.includes(target.datasource.type)) {
            return;
          }
        }
        if(((target.mode === 'code' || target.only_promql) && target.source?.length) || target.query_configs?.length) {
            strategySubMenu.push({
              text: 'Query ' + (target.refId || target.source),
              onClick: (event: React.MouseEvent<any>) => {
                event.preventDefault();
                onAddStrategy(target)
              },
            })
            dataRetrievalSubMenu.push({
              text: 'Query ' + (target.refId || target.source),
              onClick: (event: React.MouseEvent<any>) => {
                event.preventDefault();
                onDataRetrieval(target)
              },
            })
            alertSubMenu.push({
              text: 'Query ' + (target.refId || target.source),
              onClick: (event: React.MouseEvent<any>) => {
                event.preventDefault();
                onRelateAlert(target)
              },
            })
        }
      })
      strategySubMenu.length && menu.push({
        type: strategySubMenu.length > 1 ? 'submenu' : undefined,
        text: !isEnLang ? '添加策略' : 'Add Rule',
        iconClassName: 'signal',
        ...(strategySubMenu.length > 1 ? {subMenu: strategySubMenu} : {onClick: strategySubMenu[0].onClick})
      });
      dataRetrievalSubMenu.length &&
        menu.push({
          type: dataRetrievalSubMenu.length > 1 ? 'submenu' : undefined,
          text: !isEnLang ? '数据检索' : 'Explore',
          iconClassName: 'search',
          ...(dataRetrievalSubMenu.length > 1 ? {subMenu: dataRetrievalSubMenu} : {onClick: dataRetrievalSubMenu[0].onClick})
      });
      alertSubMenu.length && menu.push({
        type: alertSubMenu.length > 1 ? 'submenu' : undefined,
        text: !isEnLang ? '相关告警' : 'Related Alarms',
        iconClassName: 'heart-break',
        ...(alertSubMenu.length > 1 ? {subMenu: alertSubMenu} : {onClick: alertSubMenu[0].onClick})
      });
    }
  }
  // if (
  //   contextSrv.hasAccessToExplore() &&
  //   !(panel.plugin && panel.plugin.meta.skipDataQuery) &&
  //   panel.datasource?.uid !== SHARED_DASHBOARD_QUERY
  // ) {
  //   menu.push({
  //     text: t('panel.header-menu.explore', `Explore`),
  //     iconClassName: 'compass',
  //     onClick: onNavigateToExplore,
  //     shortcut: 'p x',
  //   });
  // }

  const inspectMenu: PanelMenuItem[] = [];

  // Only show these inspect actions for data plugins
  if (panel.plugin && !panel.plugin.meta.skipDataQuery) {
    inspectMenu.push({
      text: t('panel.header-menu.inspect-data', `Data`),
      onClick: (e: React.MouseEvent) => onInspectPanel(InspectTab.Data),
    });

    if (dashboard.meta.canEdit) {
      inspectMenu.push({
        text: t('panel.header-menu.query', `Query`),
        onClick: (e: React.MouseEvent) => onInspectPanel(InspectTab.Query),
      });
    }
  }

  inspectMenu.push({
    text: t('panel.header-menu.inspect-json', `Panel JSON`),
    onClick: (e: React.MouseEvent) => onInspectPanel(InspectTab.JSON),
  });

  menu.push({
    type: 'submenu',
    text: t('panel.header-menu.inspect', `Inspect`),
    iconClassName: 'info-circle',
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      const currentTarget = e.currentTarget;
      const target = e.target;

      if (
        target === currentTarget ||
        (target instanceof HTMLElement && target.closest('[role="menuitem"]') === currentTarget)
      ) {
        onInspectPanel();
      }
    },
    shortcut: 'i',
    subMenu: inspectMenu,
  });

  const createAlert = async () => {
    const formValues = await panelToRuleFormValues(panel, dashboard);

    const ruleFormUrl = urlUtil.renderUrl('/alerting/new', {
      defaults: JSON.stringify(formValues),
      returnTo: location.pathname + location.search,
    });

    locationService.push(ruleFormUrl);
  };


  const subMenu: PanelMenuItem[] = [];
  const canEdit = dashboard.canEditPanel(panel);
  const isCreateAlertMenuOptionAvailable = getCreateAlertInMenuAvailability();

  if (!(panel.isViewing || panel.isEditing)) {
    if (canEdit) {
      subMenu.push({
        text: t('panel.header-menu.duplicate', `Duplicate`),
        onClick: onDuplicatePanel,
        shortcut: 'p d',
      });

      subMenu.push({
        text: t('panel.header-menu.copy', `Copy`),
        onClick: onCopyPanel,
      });

      if (isPanelModelLibraryPanel(panel)) {
        subMenu.push({
          text: t('panel.header-menu.unlink-library-panel', `Unlink library panel`),
          onClick: onUnlinkLibraryPanel,
        });
      } else {
        subMenu.push({
          text: t('panel.header-menu.create-library-panel', `Create library panel`),
          onClick: onAddLibraryPanel,
        });
      }
    } else if (contextSrv.isEditor) {
      // An editor but the dashboard is not editable
      subMenu.push({
        text: t('panel.header-menu.copy', `Copy`),
        onClick: onCopyPanel,
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

  if (panel.options.legend) {
    subMenu.push({
      text: panel.options.legend.showLegend
        ? t('panel.header-menu.hide-legend', 'Hide legend')
        : t('panel.header-menu.show-legend', 'Show legend'),
      onClick: onToggleLegend,
      shortcut: 'p l',
    });
  }

  // When editing hide most actions
  if (panel.isEditing) {
    subMenu.length = 0;
    // if (isCreateAlertMenuOptionAvailable) {
    //   subMenu.push({
    //     text: t('panel.header-menu.new-alert-rule', `New alert rule`),
    //     onClick: onCreateAlert,
    //   });
    // }
  }

  if (canEdit && panel.plugin && !panel.plugin.meta.skipDataQuery) {
    subMenu.push({
      text: t('panel.header-menu.get-help', 'Get help'),
      onClick: (e: React.MouseEvent) => onInspectPanel(InspectTab.Help),
    });
  }

  const { extensions } = getPluginLinkExtensions({
    extensionPointId: PluginExtensionPoints.DashboardPanelMenu,
    context: createExtensionContext(panel, dashboard),
    limitPerPlugin: 3,
  });

  if (extensions.length > 0 && !panel.isEditing) {
    menu.push({
      text: 'Extensions',
      iconClassName: 'plug',
      type: 'submenu',
      subMenu: createExtensionSubMenu(extensions),
    });
  }

  if (subMenu.length) {
    menu.push({
      type: 'submenu',
      text: t('panel.header-menu.more', `More...`),
      iconClassName: 'cube',
      subMenu,
      onClick: onMore,
    });
  }

  if (dashboard.canEditPanel(panel) && !panel.isEditing && !panel.isViewing) {
    menu.push({ type: 'divider', text: '' });

    menu.push({
      text: t('panel.header-menu.remove', `Remove`),
      iconClassName: 'trash-alt',
      onClick: onRemovePanel,
      shortcut: 'p r',
    });
  }

  return menu;
}

function createExtensionContext(panel: PanelModel, dashboard: DashboardModel): PluginExtensionPanelContext {
  return {
    id: panel.id,
    pluginId: panel.type,
    title: panel.title,
    timeRange: dashboard.time,
    timeZone: getTimeZone({
      timeZone: dashboard.timezone,
    }),
    dashboard: {
      uid: dashboard.uid,
      title: dashboard.title,
      tags: Array.from<string>(dashboard.tags),
    },
    targets: panel.targets,
    scopedVars: panel.scopedVars,
    data: panel.getQueryRunner().getLastResult(),
  };
}
