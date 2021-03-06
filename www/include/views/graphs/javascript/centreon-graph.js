/* global jQuery: false */
(function ($) {
  function CentreonGraph(settings, $elem) {
    var self = this;
    var parseInterval;
    var times;
    this.settings = settings;
    this.$elem = $elem;
    this.chart = null;
    this.chartSvg = null;
    this.chartData = null;
    this.refreshEvent = null;
    this.forceDisplay = false;
    parseInterval = settings.interval.match(/(\d+)([a-z]+)/i);
    this.interval = {
      number: parseInterval[1],
      unit: parseInterval[2]
    };
    this.ids = {};
    this.toggleAction = 'hide';

    if ($elem.attr('id') === undefined) {
      $elem.attr('id', function () {
        function s4() {
          return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
        }
        return 'c' + s4() + s4() + s4() + s4();
      });
    }

    /* Prepare extra legends */
    this.legendDiv = jQuery('<div>').addClass('chart-legends');
    this.$elem.after(this.legendDiv);

    this.timeFormat = this.getTimeFormat();

    /* Color for status graph */
    this.colorScale = d3.scale.ordinal().range([
      '#88b917',
      '#ff9a13',
      '#e00b3d',
      '#bcbdc0'
    ]).domain([
      'ok',
      'warning',
      'critical',
      'unknown'
    ]);

    this.loadGraphId();

    /* Get start time and end time */
    times = this.getTimes();

    this.loadData(times.start, times.end, function (data) {
      self.initGraph(data);
    });

    this.setRefresh(this.settings.refresh);

  }

  CentreonGraph.prototype = {
    /**
     * Load graph type and graph id
     *
     * Use in first attribue data-graphType and data-graphId and next
     * the settings graph.type and graph.id
     *
     * Type :
     *   * service
     *   * metaservice
     */
    loadGraphId: function () {
      var start = this.$elem.data('graphPeriodStart');
      var end = this.$elem.data('graphPeriodEnd');
      var interval = this.$elem.data('graphInterval');
      this.type = this.$elem.data('graphType');
      this.id = this.$elem.data('graphId');
      if (this.type === null || this.type === undefined) {
        this.type = this.settings.graph.type;
      }
      if (this.id === null  || this.type === undefined) {
        this.id = this.settings.graph.id;
      }
      if (start !== null && start !== undefined) {
        this.settings.period.startTime = start;
      }
      if (end !== null && end !== undefined ) {
        this.settings.period.startTime = end;
      }
      if (interval !== null && interval !== undefined) {
        this.setInterval(interval, false);
      }

      if (this.type === null || this.id === null) {
        throw new Error('The graph configuration is missing.');
      }
    },
    /**
     * Initialize the graph
     *
     * Call the method by graph type
     *
     * @param {Object} data - The graph data
     */
    initGraph: function (data) {
      this.chartData = data;
      if (this.type === 'status') {
        this.initGraphStatus(data);
      } else {
        this.initGraphMetrics(data);
      }
    },
    /**
     * Initialize the status graph
     *
     * @param {Object} data - The graph data
     */
    initGraphStatus: function (data) {
      var self = this;

      this.chart = centreonStatusChart.generate({
        tickFormat: {
          format: this.timeFormat
        },
        bindto: '#' + this.$elem.attr('id'),
        data: this.buildStatusData(data),
        margin: {
          left: 0,
          right: 0,
          top: 0,
          bottom: 0
        }
      });
    },
    /**
     * Initialize the metrics graph
     *
     * @param {Object} data - The graph data
     */
    initGraphMetrics: function (data) {
      var self = this;
      var axis = {
        x: {
          padding: {left: 0, right: 0},
          type: 'timeseries',
          tick: {
            fit: false,
            format: this.timeFormat
          }
        },
        y: {
          padding: {bottom: 0, top: 0},
          tick: {
            format: this.getAxisTickFormat(this.getBase())
          }
        }
      };
      /* Add Y axis range */
      if (data.limits.min) {
        axis.y.min = numeral(data.limits.min).value();
      }
      if (data.limits.max) {
        axis.y.max = numeral(data.limits.max).value();
      }

      var parsedData = this.buildMetricData(data);

      axis = jQuery.extend(true, {}, axis, parsedData.axis);
      if (axis.hasOwnProperty('y2')) {
        axis.y2.tick = {
          format: this.getAxisTickFormat(this.getBase())
        };
      }

      if (data.data.length > 15) {
          datasToAppend = {
            x: parsedData.data.x,
            columns: [],
            names: {},
            types: {},
            colors: {},
            regions: {},
            order: null,
            empty: { label: { text: "Too much metrics, the chart can't be displayed" } }
          }
      } else {
          datasToAppend = parsedData.data;
      }

      this.chart = c3.generate({
        bindto: '#' + this.$elem.attr('id'),
        size: {
          height: this.settings.height
        },
        //padding: this.settings.padding,
        data: datasToAppend,
        axis: axis,
        tooltip: {
          format: {
            title: function (x) {
              return moment(x).format('YYYY-MM-DD HH:mm:ss');
            },
            value: function (value, ratio, id) {
              /* Test if the curve is inversed */
              var fct = self.getAxisTickFormat(
                self.getBase(),
                self.isInversed(id)
              );
              return fct(value);
            }
          }
        },
        zoom_select: self.settings.zoom,
        point: {
          show: true,
          r: 0,
          focus: {
            expand: {
              r: 4
            }
          }
        },
        regions: self.buildRegions(data),
        legend: {
          show: false
        }
      });

      if (data.data.length > 15) {
          jQuery("#display-graph-" + self.id).css('display', 'block');
          jQuery("#display-graph-" + self.id).on('click', function (e){
              self.chart.load(parsedData.data)
              self.chart.regions(self.buildRegions(data));
              jQuery(this).css('display', 'none');
          });
      }

      this.buildLegend(data.legends);
    },
    /**
     * Load data from rest api in ajax
     *
     * @param {Number} start - The start time in unixtimestamp
     * @param {Number} end - The end time in unixtimestamp
     * @param {Function} [callback] - The callback when receive the datas
     */
    loadData: function (start, end, callback) {
      var self = this;
      var action = {
        status: 'statusByService',
        service: 'metricsDataByService',
        metric: 'metricsDataByMetric',
        poller : 'metricsDataByPoller'
      };
      var url = self.settings.url;
      url += '&action=' + action[this.type];
      url += '&ids=' + this.id;
      url += '&start=' + start + '&end=' + end;
      $.ajax({
        url: url,
        type: 'GET',
        dataType: 'json',
        success: function (data) {
          if (typeof callback === 'function') {
            return callback(data[0]);
          }
          if (self.type === 'status') {
            self.chart.load(
              self.buildStatusData(data[0])
            );
          } else {
              self.chart.load(self.buildMetricData(data[0]).data);
              self.chart.regions(self.buildRegions(data[0]));
              self.buildExtraLegend(data[0].legends);
          }
        }
      });
    },
    /**
     * Build data for metrics graph
     *
     * @param {Object} dataRaw - The raw data
     * @return {Object} - The converted data
     */
    buildMetricData: function (dataRaw) {
      var convertType = {
        /* 
         * line: 'spline',
         * area: 'area-spline'
         */
        /*
         * No more artifacts on curves
         */
        line: 'line',
        area: 'area'
      };
      var i = 0;
      var data = {
        columns: [],
        names: {},
        types: {},
        colors: {},
        regions: {},
        order: null,
        empty: { label: { text: "There's no data" } }
      };

      var units = {};
      var axis = {};
      var column;
      var name;
      var legend;
      var axesName;
      var unit;
      var times = dataRaw.times;
      var thresholdData;
      var nbPoints;
      times = times.map(function (time) {
        return time * 1000;
      });
      times.unshift('times');

      data.columns.push(times);
      for (i = 0; i < dataRaw.data.length; i++) {
        name = 'data' + (i + 1);
        this.ids[dataRaw.data[i].label] = name;
        column = dataRaw.data[i].data;
        column.unshift(name);
        data.columns.push(column);
        legend = dataRaw.data[i].label;
        if (dataRaw.data[i].unit) {
          legend += '(' + dataRaw.data[i].unit + ')';
          if (units.hasOwnProperty(dataRaw.data[i].unit) === false) {
            units[dataRaw.data[i].unit] = [];
          }
          units[dataRaw.data[i].unit].push(name);
        }
        data.names[name] = legend;
        data.types[name] = convertType.hasOwnProperty(dataRaw.data[i].type) !== -1 ?
          convertType[dataRaw.data[i].type] : dataRaw.data[i].type;
        data.colors[name] = dataRaw.data[i].color;
      }

      if (Object.keys(units).length === 2) {
        axesName = 'y';
        data.axes = {};
        for (unit in units) {
          if (units.hasOwnProperty(unit)) {
            for (i = 0; i < units[unit].length; i++) {
              data.axes[units[unit][i]] = axesName;
            }
          }
          axis[axesName] = {
            label: unit
          };
          axesName = 'y2';
        }
        axis.y2.show = true;
      }

      data.x = 'times';

      /* Prepare threshold */
      if (this.settings.threshold && dataRaw.data.length === 1) {
        nbPoints = dataRaw.data[0].data.length;
        if (dataRaw.data[0].warn) {
          data.colors.warn = '#ff9a13';
          data.types.warn = 'line';
          data.names.warn = 'Warning';
          thresholdData = Array.apply(null, Array(nbPoints))
              .map(function () {
                return dataRaw.data[0].warn;
              });
          thresholdData.unshift('warn');
          data.columns.push(thresholdData);
          data.regions.warn = [{style: 'dashed'}];
        }
        if (dataRaw.data[0].crit) {
          data.colors.crit = '#e00b3d';
          data.types.crit = 'line';
          data.names.crit = 'Critical';
          thresholdData = Array.apply(null, Array(nbPoints))
            .map(function () {
              return dataRaw.data[0].crit;
            });
          thresholdData.unshift('crit');
          data.columns.push(thresholdData);
          data.regions.crit = [{style: 'dashed'}];
        }
      }

      /* Add group */
      data.groups = this.buildGroups(dataRaw);

      return {
        data: data,
        axis: axis
      };
    },
    /**
     * Build data for status graph
     *
     * @param {Object} dataRaw - The raw data
     * @return {Object} - The converted data
     */
    buildStatusData: function (dataRaw) {
      var status;
      var data = {};
      var dataStatus = [];
      var statusColor = {
        ok: '#88b917',
        warning: '#ff9a13',
        critical: '#e00b3d',
        unknown: '#bcbdc0'
      };

      for (status in dataRaw.data.status) {
        if (dataRaw.data.status.hasOwnProperty(status)) {
          if (dataRaw.data.status[status].length > 0) {
            dataStatus.push({
              label: status,
              color: statusColor[status],
              times: dataRaw.data.status[status].map(function (values) {
                return {
                  starting_time: values['start'] * 1000,
                  ending_time: values['end'] * 1000
                };
              })
            });
          }
        }
      }

      data = {
        status: dataStatus,
        comments: dataRaw.data.comments.map(function (values) {
          values['time'] = values['time'] * 1000;
          return values;
        })
      };

      return data;
    },
    /**
     * Build regions
     *
     * @param {Object} data - The chart datas
     * @return {Array} - The list of regions
     */
    buildRegions: function (data) {
      var regions = [];
      var i;
      for (i = 0; i < data.acknowledge.length; i++) {
        regions.push({
          start: data.acknowledge['start'] * 1000,
          end: data.acknowledge['end'] * 1000,
          class: 'region-ack'
        });
      }
      for (i = 0; i < data.downtime.length; i++) {
        regions.push({
          start: data.downtime[i]['start'] * 1000,
          end: data.downtime[i]['end'] * 1000,
          class: 'region-downtime'
        });
      }

      return regions;
    },
    /**
     * Build regions
     *
     * @param {Object} data - The chart datas
     * @return {Array} - The list of regions
     */
    buildGroups: function (data) {
      var group = [];
      var i;
      var name;

      for (i = 0; i < data.data.length; i++) {
        name = 'data' + (i + 1);
        if (data.data[i].stack) {
          group.push(name);
        }
      }

      return [group];
    },
    /**
     * Refresh data of graph
     */
    refreshData: function () {
      var times = this.getTimes();
      this.loadData(times.start, times.end);
    },
    /**
     * Get time start and end in unixtimestamp
     *
     * @return {Object} - The object with date start and end
     */
    getTimes: function () {
      var start;
      var end;

      if (this.settings.period.startTime === null ||
        this.settings.period.endTime === null) {

        start = moment();
        end = moment();

        start.subtract(this.interval.number, this.interval.unit);

      } else {

        myStart = this.settings.period.startTime;
        myEnd = this.settings.period.endTime;
        if (typeof(this.settings.period.startTime) === "number") {
          myStart = this.settings.period.startTime * 1000;
        }

        if (typeof(this.settings.period.endTime) === "number") {
          myEnd = this.settings.period.endTime * 1000;
        }

        start = moment(myStart);
        end = moment(myEnd);
      }

      return {
        start: start.unix(),
        end: end.unix()
      }
    },
    /**
     * Define tick for timeseries
     */
    getTimeFormat: function() {
      var timeFormat;
      if (this.settings.timeFormat !== null) {
        timeFormat = this.settings.timeFormat;
      } else {
        timeFormat = d3.time.format.multi([
          [".%L", function(d) { return d.getMilliseconds(); }],
          [":%S", function(d) { return d.getSeconds(); }],
          ["%H:%M", function(d) { return d.getMinutes(); }],
          ["%H:%M", function(d) { return d.getHours(); }],
          ["%m-%d", function(d) { return d.getDay() && d.getDate() !== 1; }],
          ["%m-%d", function(d) { return d.getDate() !== 1; }],
          ["%Y-%m", function(d) { return d.getMonth(); }],
          ["%Y", function() { return true; }]
        ]);
      }

      return timeFormat;
    },
    /**
     * Resize the graph
     */
    resize: function () {
      this.chart.resize({
        width: this.$elem.width(),
        height: null
      });
    },
    /**
     * Set an interval string for graph
     *
     * Format : see momentjs
     *
     * @param {String} interval - A interval string
     */
    setInterval: function (interval, refresh) {
      refresh = (refresh !== undefined) ? refresh : true
      var parseInterval = interval.match(/(\d+)([a-z]+)/i);
      this.settings.period = {
        startTime: null,
        endTime: null
      };
      this.interval = {
        number: parseInterval[1],
        unit: parseInterval[2]
      };
      if (refresh) {
        this.refreshData();
      }
    },
    /**
     * Set a period with start and end time
     *
     * @param {String} start - The start time
     * @param {String} end - The end time
     */
    setPeriod: function (start, end) {
      this.settings.period = {
        startTime: start,
        endTime: end
      };
      this.refreshData();
    },
    /**
     * Set auto refresh interval
     *
     * @param {Number} interval - The number of seconds to refresh,
     *                            0 stop the auto refresh
     */
    setRefresh: function (interval) {
      var self = this;
      this.refresh = interval;

      if (this.refreshEvent !== null) {
        clearInterval(this.refreshEvent);
        this.refreshEvent = null;
      }

      if (this.refresh > 0) {
        this.refreshEvent = setInterval(function () {
          self.refreshData();
        }, self.refresh * 1000);
      }
    },
    /**
     * Get function for humanreadable tick
     *
     * @param {Integer} base - The value to transform
     * @return {Function} - The function for round the axes tick
     */
    getAxisTickFormat: function (base, inversed) {
      if (base === 1024 || base === '1024') {
        if (inversed) {
          return this.inverseRoundTickByte;
        }
        return this.roundTickByte;
      }
      if (inversed) {
        return this.inverseRoundTick;
      }
      return this.roundTick;
    },
    /**
     * Round the value of a point and transform to humanreadable
     *
     * @param {Float} value - The value to transform
     * @return {String} - The value transformed
     */
    roundTick: function (value) {
      if (value < 0) {
        return '-' + numeral(Math.abs(value)).format('0.0[0]0b').replace(/B/, '');
      }
      return numeral(value).format('0.0[0]0b').replace(/B/, '');
    },
    /**
     * Round the value of a point and transform to humanreadable for bytes
     *
     * @param {Float} value - The value to transform
     * @return {String} - The value transformed
     */
    roundTickByte: function (value) {
      if (value < 0) {
          return '-' + numeral(Math.abs(value)).format('0.0[0]0ib').replace(/iB/, 'B');
      }
      return numeral(value).format('0.0[0]0ib').replace(/iB/, 'B');
    },
    /**
     * Round the value of a point and transform to humanreadable
     * and inverse the value if the curve is inversed
     *
     * @param {Float} value - The value to transform
     * @return {String} - The value transformed
     */
    inverseRoundTick: function (value) {
      return '-' + numeral(Math.abs(value)).format('0.0[0]0b').replace(/B/, '');
    },
    /**
     * Round the value of a point and transform to humanreadable for bytes
     * and inverse the value if the curve is inversed
     *
     * @param {Float} value - The value to transform
     * @return {String} - The value transformed
     */
    inverseRoundTickByte: function (value) {
      return '-' +  numeral(Math.abs(value)).format('0.0[0]0ib').replace(/iB/, 'B');
    },
    /**
     * Return is the curve is inversed / negative
     *
     * @param {String} id - The curve id
     * @return {Boolean} - If the curve is inversed
     */
    isInversed: function (id) {
      var pos = parseInt(id.replace('data', ''), 10) - 1;
      if (id === 'crit' || id === 'warn') {
        return false;
      }
      return this.chartData.data[pos].negative;
    },
    /**
     * Get base for 1000 or 1024 for a curve
     *
     * @param {String} id - The curve id
     * @return {Integer} - 1000 or 1024
     */
    getBase: function () {
      if (this.chartData.base) {
        return this.chartData.base;
      }
      return 1000;
    },
    /**
     * Build for display the legends
     *
     * @param {String[]} legends - The list of legends to display
     */
    buildLegend: function (legends) {
      var self = this;
      var legendDiv;
      var legendInfo;
      var legendLabel;
      var legendExtra;
      var curveId;
      var i;
      for (legend in legends) {
        if (legends.hasOwnProperty(legend) && self.ids.hasOwnProperty(legend)) {
          curveId = self.ids[legend];
          var fct = self.getAxisTickFormat(
              self.getBase(),
              self.isInversed(curveId)
          );
          legendDiv = jQuery('<div>').addClass('chart-legend')
            .data('curveid', curveId)
            .data('legend', legend);

          /* Build legend for a curve */
          legendLabel = jQuery('<div>')
            .append(
              /* Color */
              jQuery('<div>')
                .addClass('chart-legend-color')
                .css({
                  'background-color': self.chart.color(curveId)
                })
            )
            .append(
              jQuery('<span>').text(legend)
            );
          legendLabel.appendTo(legendDiv);

          /* Build legend extra */
          for (i = 0; i < legends[legend].extras.length; i++) {
            legendExtra = jQuery('<div>').addClass('extra')
              .append(
                jQuery('<span>')
                  .text(legends[legend].extras[i].name + ' :')
              )
              .append(
                jQuery('<span>')
                  .text(fct(legends[legend].extras[i].value))
              )
            legendExtra.appendTo(legendDiv);
          }

          legendDiv
            .on('mouseover', 'div', function (e) {
              var curveId = jQuery(e.currentTarget).parent().data('curveid');
              self.chart.focus(curveId);
            })
            .on('mouseout', 'div', function () { self.chart.revert(); })
            .on('click', function (e) {
              var curveId = jQuery(e.currentTarget).data('curveid');
              jQuery(e.currentTarget).toggleClass('hidden');
              self.chart.toggle(curveId);
            });

          legendDiv.appendTo(this.legendDiv);
        }
      }
      /* Append actions button */
      actionDiv = jQuery('<div>').addClass('chart-legend-action');
      if (this.settings.buttonToggleCurves) {
        toggleCurves = jQuery('<img>').attr('src', './img/icons/rub.png')
          .on('click', function () {
            if (self.toggleAction === 'hide') {
              self.toggleAction = 'show';
              self.legendDiv.find('.chart-legend').addClass('hidden');
              self.chart.hide();
            } else {
              self.toggleAction = 'hide';
              self.legendDiv.find('.chart-legend').removeClass('hidden');
              self.chart.show();
            }
          }).appendTo(actionDiv);
      }
        if (self.settings.extraLegend) {
            expandLegend = jQuery('<img>').attr('src', './img/icons/info2.png')
                .on('click', function () {
                    self.legendDiv.toggleClass('extend');
                }).appendTo(actionDiv);
        }
      actionDiv.appendTo(self.legendDiv);
    },
    /**
     * Build for display the extra legends
     *
     * @param {String[]} legends - The list of legends to display
     */
    buildExtraLegend: function (legends) {
      var self = this;
      var i;

      jQuery('.chart-legend').each(function (idx, el) {
        var legendName = jQuery(el).data('legend');
        if (!self.ids.hasOwnProperty(legendName)) {
          return true;
        }
        var curveId = self.ids[legendName];
        var fct = self.getAxisTickFormat(
          self.getBase(),
          self.isInversed(curveId)
        );
        jQuery(el).find('.extra').remove();
        if (legends.hasOwnProperty(legendName)) {
          for (i = 0; i < legends[legendName].extras.length; i++) {
            legendExtra = jQuery('<div>').addClass('extra')
              .append(
                jQuery('<span>')
                  .text(legends[legendName].extras[i].name + ' :')
              )
              .append(
                jQuery('<span>')
                  .text(fct(legends[legendName].extras[i].value))
              )
            legendExtra.appendTo(el);
          }
        }
      });
    }
  };

  $.fn.centreonGraph = function (options) {
    var args = Array.prototype.slice.call(arguments, 1);
    var settings = jQuery.extend({}, $.fn.centreonGraph.defaults, options);
    var methodReturn;
    var $set = this.each(function () {
      var $this = jQuery(this);
      var data = $this.data("centreonGraph");

      if (!data) {
        $this.data(
          "centreonGraph",
          (data = new CentreonGraph(settings, $this))
        );
      }

      if (typeof options === "string") {
        methodReturn = data[options].apply(data, args);
      }
    });
    return (methodReturn === undefined) ? $set : methodReturn;
  };

  $.fn.centreonGraph.defaults = {
    refresh: 0,
    height: 230,
    zoom: {
      enabled: false,
      onzoom: null
    },
    graph: {
      id: null,
      type: null
    },
    interval: '3h',
    period: {
      startTime: null,
      endTime: null
    },
    timeFormat: null,
    threshold: true,
    extraLegend: true,
    buttonToggleCurves: true,
    url: './api/internal.php?object=centreon_metric'
  };
})(jQuery);
