sap.ui.define([
	'sap/ui/core/mvc/Controller',
	'sap/ui/model/odata/v2/ODataModel',
], function (Controller,ODataModel) {
	"use strict";

	return Controller.extend("comex.zcomexapp.controller.Upload", {
		onInit: function () {
			var oMockServer, oModel, oView, sServiceUrl;

			oModel = 

			oView = this.getView();
			oView.setModel(oModel);
		},
		onBeforeExport: function (oEvt) {
			var mExcelSettings = oEvt.getParameter("exportSettings");

			// Disable Worker as Mockserver is used in Demokit sample
			mExcelSettings.worker = false;
		},
		onExit: function () {
			// this._oMockServer.stop();
		}
	});
});
