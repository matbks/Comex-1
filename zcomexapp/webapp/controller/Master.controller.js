/*global history */
sap.ui.define(
  [
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/GroupHeaderListItem",
    "sap/ui/Device",
    "../model/formatter",
    "../model/grouper",
    "../model/GroupSortState",
    "sap/ui/unified/FileUploader",
    "sap/m/MessageBox",
  ],
  function (
    BaseController,
    JSONModel,
    Filter,
    FilterOperator,
    GroupHeaderListItem,
    Device,
    formatter,
    grouper,
    GroupSortState,
    FileUploader,
    MessageBox
  ) {
    "use strict";

    return BaseController.extend("comex.zcomexapp.controller.Master", {
      formatter: formatter,

      /* =========================================================== */
      /* lifecycle methods                                           */
      /* =========================================================== */

      /**
       * Called when the master list controller is instantiated. It sets up the event handling for the master/detail communication and other lifecycle tasks.
       * @public
       */
      onInit: function () {
        // Control state model
        var oList = this.byId("list"),
          oViewModel = this._createViewModel(),
          // Put down master list's original value for busy indicator delay,
          // so it can be restored later on. Busy handling on the master list is
          // taken care of by the master list itself.
          iOriginalBusyDelay = oList.getBusyIndicatorDelay();

        this._oGroupSortState = new GroupSortState(
          oViewModel,
          grouper.groupUnitNumber(this.getResourceBundle())
        );

        this._oList = oList;
        // keeps the filter and search state
        this._oListFilterState = {
          aFilter: [],
          aSearch: [],
        };

        this.setModel(oViewModel, "masterView");
        // Make sure, busy indication is showing immediately so there is no
        // break after the busy indication for loading the view's meta data is
        // ended (see promise 'oWhenMetadataIsLoaded' in AppController)
        oList.attachEventOnce("updateFinished", function () {
          // Restore original busy indicator delay for the list
          oViewModel.setProperty("/delay", iOriginalBusyDelay);
        });

        this.getView().addEventDelegate({
          onBeforeFirstShow: function () {
            this.getOwnerComponent().oListSelector.setBoundMasterList(oList);
          }.bind(this),
        });

        this.getRouter()
          .getRoute("master")
          .attachPatternMatched(this._onMasterMatched, this);
        this.getRouter().attachBypassed(this.onBypassed, this);
      },

      /* =========================================================== */
      /* event handlers                                              */
      /* =========================================================== */

      /**
       * After list data is available, this handler method updates the
       * master list counter and hides the pull to refresh control, if
       * necessary.
       * @param {sap.ui.base.Event} oEvent the update finished event
       * @public
       */
      onUpdateFinished: function (oEvent) {
        // update the master list object counter after new data is loaded
        this._updateListItemCount(oEvent.getParameter("total"));
        // hide pull to refresh if necessary
        this.byId("pullToRefresh").hide();
      },

      /**
       * Event handler for the master search field. Applies current
       * filter value and triggers a new search. If the search field's
       * 'refresh' button has been pressed, no new search is triggered
       * and the list binding is refresh instead.
       * @param {sap.ui.base.Event} oEvent the search event
       * @public
       */
      onSearch: function (oEvent) {
        if (oEvent.getParameters().refreshButtonPressed) {
          // Search field's 'refresh' button has been pressed.
          // This is visible if you select any master list item.
          // In this case no new search is triggered, we only
          // refresh the list binding.
          this.onRefresh();
          return;
        }

        var sQuery = oEvent.getParameter("query");

        if (sQuery) {
          this._oListFilterState.aSearch = [
            new Filter("Invoice", FilterOperator.Contains, sQuery),
          ];
        } else {
          this._oListFilterState.aSearch = [];
        }
        this._applyFilterSearch();
      },

      /**
       * Event handler for refresh event. Keeps filter, sort
       * and group settings and refreshes the list binding.
       * @public
       */
      onRefresh: function () {
        this._oList.getBinding("items").refresh();
      },

      /**
       * Event handler for the sorter selection.
       * @param {sap.ui.base.Event} oEvent the select event
       * @public
       */
      onSort: function (oEvent) {
        var sKey = oEvent.getSource().getSelectedItem().getKey(),
          aSorters = this._oGroupSortState.sort(sKey);

        this._applyGroupSort(aSorters);
      },

      /**
       * Event handler for the grouper selection.
       * @param {sap.ui.base.Event} oEvent the search field event
       * @public
       */
      onGroup: function (oEvent) {
        var sKey = oEvent.getSource().getSelectedItem().getKey(),
          aSorters = this._oGroupSortState.group(sKey);

        this._applyGroupSort(aSorters);
      },

      /**
       * Event handler for the filter button to open the ViewSettingsDialog.
       * which is used to add or remove filters to the master list. This
       * handler method is also called when the filter bar is pressed,
       * which is added to the beginning of the master list when a filter is applied.
       * @public
       */
      onOpenViewSettings: function () {
        if (!this._oViewSettingsDialog) {
          this._oViewSettingsDialog = sap.ui.xmlfragment(
            "comex.zcomexapp.fragment.ViewSettingsDialog",
            this
          );
          this.getView().addDependent(this._oViewSettingsDialog);
          // forward compact/cozy style into Dialog
          this._oViewSettingsDialog.addStyleClass(
            this.getOwnerComponent().getContentDensityClass()
          );
        }
        this._oViewSettingsDialog.open();
      },

      /**
       * Event handler called when ViewSettingsDialog has been confirmed, i.e.
       * has been closed with 'OK'. In the case, the currently chosen filters
       * are applied to the master list, which can also mean that the currently
       * applied filters are removed from the master list, in case the filter
       * settings are removed in the ViewSettingsDialog.
       * @param {sap.ui.base.Event} oEvent the confirm event
       * @public
       */
      onConfirmViewSettingsDialog: function (oEvent) {
        var aFilterItems = oEvent.getParameters().filterItems,
          aFilters = [],
          aCaptions = [];

        // update filter state:
        // combine the filter array and the filter string
        aFilterItems.forEach(function (oItem) {
          switch (oItem.getKey()) {
            case "Filter1":
              aFilters.push(new Filter("UnitNumber", FilterOperator.LE, 100));
              break;
            case "Filter2":
              aFilters.push(new Filter("UnitNumber", FilterOperator.GT, 100));
              break;
            default:
              break;
          }
          aCaptions.push(oItem.getText());
        });

        this._oListFilterState.aFilter = aFilters;
        this._updateFilterBar(aCaptions.join(", "));
        this._applyFilterSearch();
      },

      /**
       * Event handler for the list selection event
       * @param {sap.ui.base.Event} oEvent the list selectionChange event
       * @public
       */
      onSelectionChange: function (oEvent) {
        // get the list item, either from the listItem parameter or from the event's source itself (will depend on the device-dependent mode).
        this._showDetail(oEvent.getParameter("listItem") || oEvent.getSource());
      },

      /**
       * Event handler for the bypassed event, which is fired when no routing pattern matched.
       * If there was an object selected in the master list, that selection is removed.
       * @public
       */
      onBypassed: function () {
        this._oList.removeSelections(true);
      },

      /**
       * Used to create GroupHeaders with non-capitalized caption.
       * These headers are inserted into the master list to
       * group the master list's items.
       * @param {Object} oGroup group whose text is to be displayed
       * @public
       * @returns {sap.m.GroupHeaderListItem} group header with non-capitalized caption.
       */
      createGroupHeader: function (oGroup) {
        return new GroupHeaderListItem({
          title: oGroup.text,
          upperCase: false,
        });
      },

      /**
       * Event handler for navigating back.
       * We navigate back in the browser historz
       * @public
       */
      onNavBack: function () {
        history.go(-1);
      },

      onAddPress: function (oEvent) {
        var that = this;
        var fileURL;
        if (!this._oUploadDialog) {
          this._oUploadDialog = new sap.m.Dialog({
            title: "{i18n>loadFile}",
            resizable: true,
            draggable: true,
            content: [
              new FileUploader(this.createId("fileUploader"), {
                fileType: "csv",
                value: "{masterView>/uploadInicialValue}",
                change: function (oEvent) {
                  this.getModel("masterView").setProperty(
                    "/uploadButton",
                    true
                  );
                }.bind(this),
                uploadComplete: function (oEvent) {}.bind(this),
              }),
            ],
            beginButton: new sap.m.Button(this.createId("buttonUpload"), {
              type: "Emphasized",
              text: "{i18n>upload}",
              visible: "{masterView>/uploadButton}",
              press: this._onLoadData.bind(this),
            }),
            endButton: new sap.m.Button({
              text: "{i18n>close}",
              press: function () {
                this._oUploadDialog.close();
              }.bind(this),
            }),
          });
          this._oUploadDialog.addStyleClass("sapUiContentPadding");
          this.getView().addDependent(this._oUploadDialog);
        }
        this.getModel("masterView").setProperty("/uploadButton", false);
        this.getModel("masterView").setProperty("/uploadInicialValue", "");
        this._oUploadDialog.open();
      },

      /* =========================================================== */
      /* begin: internal methods                                     */
      /* =========================================================== */
      _onLoadData: function () {
        var that = this;
        var JsonData = FileUpload(that);

        function FileUpload(that) {
          var oFileUpload = that.getView().byId("fileUploader");
          var domRef = oFileUpload.getFocusDomRef();
          var file = domRef.files[0];
          var reader = new FileReader();

          reader.onload = function (e) {
            var unicode = e.currentTarget.result;
            csvToJson(unicode, that);
          };
          reader.readAsBinaryString(file);
        }

        function csvToJson(csv, that) {
          const lines = csv.split("\r\n");
          const result = [];
          const headers = lines[0].split(";");

          for (let i = 1; i < lines.length; i++) {
            if (!lines[i]) continue;
            const obj = {};
            const currentline = lines[i].split(";");

            for (let j = 0; j < headers.length; j++) {
              obj[headers[j]] = currentline[j];
            }
            result.push(obj);
          }

          var payload = {
            Key: "1",
            Content: JSON.stringify(result),
          };

          var oModel = that.getView().getModel();
          oModel.create("/UploadSet", payload, {
            success: function (oData, oResponse) {
              var oSapMessage = JSON.parse(oResponse.headers["sap-message"]);

              if (oSapMessage.severity === "error") {
                MessageBox.error(oSapMessage.message);
              } else {
                MessageBox.success(oSapMessage.message);
              }
            }.bind(this),
            error: function (oError) {
              var oSapMessage = JSON.parse(oError.responseText);
              var msg = oSapMessage.error.message.value;
              MessageBox.error(msg);
            }.bind(this),
          });
        }
      },

      _createViewModel: function () {
        return new JSONModel({
          isFilterBarVisible: false,
          filterBarLabel: "",
          delay: 0,
          title: this.getResourceBundle().getText("masterTitleCount", [0]),
          noDataText: this.getResourceBundle().getText("masterListNoDataText"),
          sortBy: "Name",
          groupBy: "None",
          uploadButton: false,
          uploadInicialValue: "",
        });
      },

      /**
       * If the master route was hit (empty hash) we have to set
       * the hash to to the first item in the list as soon as the
       * listLoading is done and the first item in the list is known
       * @private
       */
      _onMasterMatched: function () {
        this.getOwnerComponent().oListSelector.oWhenListLoadingIsDone.then(
          function (mParams) {
            if (mParams.list.getMode() === "None") {
              return;
            }
            var Invoice = mParams.firstListitem
              .getBindingContext()
              .getProperty("Invoice");
            var Vendor = mParams.firstListitem
              .getBindingContext()
              .getProperty("Vendor");
            this.getRouter().navTo(
              "object",
              { Invoice: Invoice, Vendor: Vendor },
              true
            );
          }.bind(this),
          function (mParams) {
            if (mParams.error) {
              return;
            }
            this.getRouter().getTargets().display("detailNoObjectsAvailable");
          }.bind(this)
        );
      },

      /**
       * Shows the selected item on the detail page
       * On phones a additional history entry is created
       * @param {sap.m.ObjectListItem} oItem selected Item
       * @private
       */
      _showDetail: function (oItem) {
        var bReplace = !Device.system.phone;
        var teste = oItem.getBindingContext().getProperty("Vendor");

        this.getRouter().navTo(
          "object",
          {
            Invoice: oItem.getBindingContext().getProperty("Invoice"),
            Vendor: oItem.getBindingContext().getProperty("Vendor"),
          },
          bReplace
        );
      },

      /**
       * Sets the item count on the master list header
       * @param {integer} iTotalItems the total number of items in the list
       * @private
       */
      _updateListItemCount: function (iTotalItems) {
        var sTitle;
        // only update the counter if the length is final
        if (this._oList.getBinding("items").isLengthFinal()) {
          sTitle = this.getResourceBundle().getText("masterTitleCount", [
            iTotalItems,
          ]);
          this.getModel("masterView").setProperty("/title", sTitle);
        }
      },

      /**
       * Internal helper method to apply both filter and search state together on the list binding
       * @private
       */
      _applyFilterSearch: function () {
        var aFilters = this._oListFilterState.aSearch.concat(
            this._oListFilterState.aFilter
          ),
          oViewModel = this.getModel("masterView");
        this._oList.getBinding("items").filter(aFilters, "Application");
        // changes the noDataText of the list in case there are no filter results
        if (aFilters.length !== 0) {
          oViewModel.setProperty(
            "/noDataText",
            this.getResourceBundle().getText(
              "masterListNoDataWithFilterOrSearchText"
            )
          );
        } else if (this._oListFilterState.aSearch.length > 0) {
          // only reset the no data text to default when no new search was triggered
          oViewModel.setProperty(
            "/noDataText",
            this.getResourceBundle().getText("masterListNoDataText")
          );
        }
      },

      /**
       * Internal helper method to apply both group and sort state together on the list binding
       * @param {sap.ui.model.Sorter[]} aSorters an array of sorters
       * @private
       */
      _applyGroupSort: function (aSorters) {
        this._oList.getBinding("items").sort(aSorters);
      },

      /**
       * Internal helper method that sets the filter bar visibility property and the label's caption to be shown
       * @param {string} sFilterBarText the selected filter value
       * @private
       */
      _updateFilterBar: function (sFilterBarText) {
        var oViewModel = this.getModel("masterView");
        oViewModel.setProperty(
          "/isFilterBarVisible",
          this._oListFilterState.aFilter.length > 0
        );
        oViewModel.setProperty(
          "/filterBarLabel",
          this.getResourceBundle().getText("masterFilterBarText", [
            sFilterBarText,
          ])
        );
      },
    });
  }
);
