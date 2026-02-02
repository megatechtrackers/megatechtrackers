function alarmTypeObject() {
    this.isPolice = false;	//警员存在的
    this.isVehicle = true;
    this.name = null;		//报警名称
    this.parentName = null;//报警分类名称
    this.armType = null;	//开始报警 标识
    this.armEnd = null;//结束报警 标识
    this.realType = null;//真实      结束存在的时候    开始,结束
    this.classify = null;	//用于报警屏蔽和报警联动内的分类
    this.isAlarmLinkage = false; //是否报警联动需要的


}

alarmTypeObject.prototype.setIsPolice = function (isPolice) {
    this.isPolice = isPolice;
};
alarmTypeObject.prototype.setName = function (name) {
    this.name = name;
};
alarmTypeObject.prototype.setParentName = function (parentName) {
    this.parentName = parentName;
};
alarmTypeObject.prototype.setArmType = function (armType) {
    this.armType = armType;
};
alarmTypeObject.prototype.setArmEnd = function (armEnd) {
    this.armEnd = armEnd;
};
alarmTypeObject.prototype.setClassify = function (classify) {
    this.classify = classify;
};
alarmTypeObject.prototype.setAlarmLinkage = function (isAlarmLinkage_) {
    this.isAlarmLinkage = isAlarmLinkage_;
};


/**
 * 报警屏蔽和报警联动内的分类
 */
function AlarmManager() {
    this.lstAlarmTypeOjbect = [];//
    this.lst809AlarmTypeOjbect = [];//809报警分类
    this.lstAlarmClassify = [];//分类类型 {id:对应的标识  ,name:名称}
    this.isAlarmLinkage = false; //是否报警联动，如果是报警联动需要去掉几个报警
    this.isRemovePlatform = false; //是否去掉平台报警
    this.isRemoveSafety = false; //是否去掉主动安全
    this.allId = [];//所有id

    if (rootElement && typeof rootElement.getAlarmFilter == 'function') {
        this.alarmFilter = rootElement.getAlarmFilter();
    } else {
        this.alarmFilter = null;
    }
    this.isAlarmNoVehicle = false; // 特殊报警不是按车辆id入库的
    this.shieldArmType = [];//需要屏蔽的报警
}

AlarmManager.prototype.setAlarmNoVehicle = function (isAlarmNoVehicle_) {
    this.isAlarmNoVehicle = isAlarmNoVehicle_;
};

AlarmManager.prototype.setAlarmLinkage = function (isAlarmLinkage_) {
    this.isAlarmLinkage = isAlarmLinkage_;
}
AlarmManager.prototype.setRemovePlatform = function (isRemovePlatform_) {
    this.isRemovePlatform = isRemovePlatform_;
};
AlarmManager.prototype.setRemoveSafety = function (isRemoveSafety_) {
    this.isRemoveSafety = isRemoveSafety_;
};
//获取报警类型对象集合
AlarmManager.prototype.getLstAlarmTypes = function () {
    return this.lstAlarmTypeOjbect;
}

AlarmManager.prototype.getAllIds = function () {
    return this.allId.join(',');
};

AlarmManager.prototype.setShieldArmType = function (shieldArmType) {
    this.shieldArmType = shieldArmType;
};


var rootElement = _getRootFrameElement();

/**
 * 多媒体上传的事项编码解析
 */
AlarmManager.prototype.addMuckMediaEvent = function () {
    this.fillObject(rootElement.lang.illegal_area_unload, rootElement.lang.monitor_alarm_otherAlarm, "138", "", "otherAlarm", false, true);//违规卸载
    this.fillObject(rootElement.lang.unclosed_cover, rootElement.lang.monitor_alarm_otherAlarm, "139", "", "otherAlarm", false, true);  //重车行驶厢盖未关闭
}


/**
 * 自定义抓拍报警
 */
AlarmManager.prototype.addMediaAlarm = function () {
    // 处理类型的时候，定义一个超载
    this.fillObject(rootElement.lang.alarm_name_9999, rootElement.lang.monitor_alarm_otherAlarm, "9999", "", "otherAlarm", false, true);   //1
}

/**
 * 黑标新增报警
 */
AlarmManager.prototype.addHeiLongJiangAlarm = function () {
    // 驾驶员身份识别
    this.fillObject(rootElement.lang.alarm_name_510, rootElement.lang.driver_identification_event, "510", "560", "activeSafetyDriverIdentification", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_511, rootElement.lang.driver_identification_event, "511", "561", "activeSafetyDriverIdentification", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_699, rootElement.lang.driver_identification_event, "699", "749", "activeSafetyDriverIdentification", false, true);   //1
    /****************移动的驾驶员识别报警********************/
    this.fillObject(rootElement.lang.alarm_name_643, rootElement.lang.driver_identification_event, "643", null, "activeSafetyDriverIdentification", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_697, rootElement.lang.driver_identification_event, "697", null, "activeSafetyDriverIdentification", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_698, rootElement.lang.driver_identification_event, "698", null, "activeSafetyDriverIdentification", false, true);	//1
    //DSM 吉标/
    this.fillObject(rootElement.lang.alarm_name_646, rootElement.lang.driver_identification_event, "646", null, "activeSafetyDriverIdentification", false, true);	//1
    //巡检比对身份识别上报事件
    this.fillObject(rootElement.lang.alarm_name_647, rootElement.lang.driver_identification_event, "647", null, "activeSafetyDriverIdentification", false, true);	//1
    //点火比对身份识别上报事件
    this.fillObject(rootElement.lang.alarm_name_648, rootElement.lang.driver_identification_event, "648", null, "activeSafetyDriverIdentification", false, true);	//1
    //离开返回比对身份识别上报事件
    this.fillObject(rootElement.lang.alarm_name_649, rootElement.lang.driver_identification_event, "649", null, "activeSafetyDriverIdentification", false, true);	//1
    //驾驶员识别事件(平台)
    this.fillObject(rootElement.lang.alarm_name_636, rootElement.lang.driver_identification_event, "636", null, "activeSafetyDriverIdentification", false, true);	//1
    //动态查岗(平台)
    this.fillObject(rootElement.lang.alarm_name_686, rootElement.lang.driver_identification_event, "686", null, "activeSafetyDriverIdentification", false, true);	//1


    // 车辆运行监测
    // this.fillObject("前向碰撞预警", rootElement.lang.monitor_alarm_otherAlarm, "600", "", "otherAlarm", false, true);   //1
    // this.fillObject("前向碰撞报警", rootElement.lang.monitor_alarm_otherAlarm, "601", "", "otherAlarm", false, true);   //1
    // this.fillObject("车道偏离预警", rootElement.lang.monitor_alarm_otherAlarm, "602", "", "otherAlarm", false, true);   //1
    // this.fillObject("车道偏离报警", rootElement.lang.monitor_alarm_otherAlarm, "603", "", "otherAlarm", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_512, rootElement.lang.vehicle_operation_monitoring, "512", "562", "activeSafetyVehicleOperationMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_513, rootElement.lang.vehicle_operation_monitoring, "513", "563", "activeSafetyVehicleOperationMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_514, rootElement.lang.vehicle_operation_monitoring, "514", "564", "activeSafetyVehicleOperationMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_515, rootElement.lang.vehicle_operation_monitoring, "515", "565", "activeSafetyVehicleOperationMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_523, rootElement.lang.vehicle_operation_monitoring, "523", "573", "activeSafetyVehicleOperationMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_524, rootElement.lang.vehicle_operation_monitoring, "524", "574", "activeSafetyVehicleOperationMonitoring", false, true);   //1
    // 驾驶员驾驶行为监测
    // this.fillObject("疲劳驾驶预警", rootElement.lang.monitor_alarm_otherAlarm, "618", "", "otherAlarm", false, true);   //1
    // this.fillObject("疲劳驾驶报警", rootElement.lang.monitor_alarm_otherAlarm, "619", "", "otherAlarm", false, true);   //1
    // this.fillObject("手持接打电话报警", rootElement.lang.monitor_alarm_otherAlarm, "621", "", "otherAlarm", false, true);   //1
    // this.fillObject("长时间不目视前方报警", rootElement.lang.monitor_alarm_otherAlarm, "703", "", "otherAlarm", false, true);   //1
    // this.fillObject("驾驶员不在驾驶位置报警", rootElement.lang.monitor_alarm_otherAlarm, "709", "", "otherAlarm", false, true);   //1
    // this.fillObject("抽烟报警", rootElement.lang.monitor_alarm_otherAlarm, "623", "", "otherAlarm", false, true);   //1
    // 设备失效监测
    // this.fillObject("遮挡失效报警", rootElement.lang.monitor_alarm_otherAlarm, "735", "", "otherAlarm", false, true);   //1
    // this.fillObject("红外阻断型墨镜失效报警", rootElement.lang.monitor_alarm_otherAlarm, "640", "", "otherAlarm", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_516, rootElement.lang.equipment_failure_monitoring, "516", "566", "activeSafetyEquipmentFailureMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_517, rootElement.lang.equipment_failure_monitoring, "517", "567", "activeSafetyEquipmentFailureMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_518, rootElement.lang.equipment_failure_monitoring, "518", "568", "activeSafetyEquipmentFailureMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_519, rootElement.lang.equipment_failure_monitoring, "519", "569", "activeSafetyEquipmentFailureMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_520, rootElement.lang.equipment_failure_monitoring, "520", "570", "activeSafetyEquipmentFailureMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_521, rootElement.lang.equipment_failure_monitoring, "521", "571", "activeSafetyEquipmentFailureMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_522, rootElement.lang.equipment_failure_monitoring, "522", "572", "activeSafetyEquipmentFailureMonitoring", false, true);   //1
}

/**
 * 湖南(湘标)新增报警
 */
AlarmManager.prototype.addHuNanAlarm = function () {
    // 湘标
    // Dsm
    this.fillObject(rootElement.lang.alarm_name_525 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "525", "575", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_525 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "541", "591", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_526, rootElement.lang.abnormality, "526", "576", "activeSafetyDsm", false, true); //1
    // 智能检测
    this.fillObject(rootElement.lang.alarm_name_527, rootElement.lang.znjc, "527", "577", "activeSafetyZnjc", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_528, rootElement.lang.znjc, "528", "578", "activeSafetyZnjc", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_529, rootElement.lang.znjc, "529", "579", "activeSafetyZnjc", false, true);	//1
}


/**
 * 酒测数据定制开发
 */
AlarmManager.prototype.addWineTestAlarm = function () {
    // Dsm
    // 酒测正常
    this.fillObject(rootElement.lang.alarm_name_1226 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "1226", "1276", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_1226 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "1227", "1277", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_1228 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "1228", "1278", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_1228 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "1229", "1279", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_1230 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "1230", "1280", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_1230 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "1231", "1281", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_1232 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "1232", "1282", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_1232 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "1233", "1283", "activeSafetyDsm", false, true); //1

}
/**
 * 主动安全(四川)新增报警
 */
AlarmManager.prototype.addSiChuanAlarm = function () {
    this.fillObject(rootElement.lang.alarm_name_1234 + rootElement.lang.alarm_name_11111, rootElement.lang.proximity, "1234", "1284", "activeSafetyProximity", false, true);
    this.fillObject(rootElement.lang.alarm_name_1234 + rootElement.lang.alarm_name_22222, rootElement.lang.proximity, "1235", "1285", "activeSafetyProximity", false, true);

    this.fillObject(rootElement.lang.alarm_name_1414 , rootElement.lang.proximity, "1414", "1464", "activeSafetyProximity", false, true);
    this.fillObject(rootElement.lang.alarm_name_1415 , rootElement.lang.proximity, "1415", "1465", "activeSafetyProximity", false, true);



    this.fillObject(rootElement.lang.alarm_name_1236, rootElement.lang.fierce_driving_type, "1236", "1286", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_1242, rootElement.lang.fierce_driving_type, "1242", "1292", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_1243, rootElement.lang.fierce_driving_type, "1243", "1293", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_1244, rootElement.lang.fierce_driving_type, "1244", "1294", "activeSafetyFierce", false, true);    //1

    //  adas
    this.fillObject(rootElement.lang.alarm_name_1400 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "1400", "1450", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_1400 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "1401", "1451", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_1402 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "1402", "1452", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_1402 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "1403", "1453", "activeSafetyAdas", false, true);

    // DSM
    this.fillObject(rootElement.lang.alarm_name_1404 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "1404", "1454", "activeSafetyDsm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1404 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "1405", "1455", "activeSafetyDsm", false, true);


    this.fillObject(rootElement.lang.alarm_name_1406, rootElement.lang.satellite_positioning_type, "1406", "1456", "activeSafetySatellite", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1407, rootElement.lang.satellite_positioning_type, "1407", "1457", "activeSafetySatellite", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1412, rootElement.lang.satellite_positioning_type, "1412", "1462", "activeSafetySatellite", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1413, rootElement.lang.satellite_positioning_type, "1413", "1463", "activeSafetySatellite", false, true);	//1


    this.fillObject(rootElement.lang.alarm_name_1408 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "1408", "1458", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_1408 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "1409", "1459", "activeSafetyDsm", false, true); //1


    // 智能检测
    //  川标2021新增的报警
    // #define GPS_ALARM_TYPE_SB_EXCEEDING_ROAD_LOAD     545 //超过道路承重报警
    // #define GPS_ALARM_TYPE_SB_EXCEEDING_VEHICLE_LOAD  549 //超过车辆额定载重报警
    // #define NET_ALARM_TYPE_SB_EXCEEDING_GAODE         1237 //超过限定高度报警
    this.fillObject(rootElement.lang.alarm_name_545, rootElement.lang.znjc, "545", "595", "activeSafetyZnjc", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_549, rootElement.lang.znjc, "549", "599", "activeSafetyZnjc", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1237, rootElement.lang.znjc, "1237", "1287", "activeSafetyZnjc", false, true);	//1
    // DSM
    // #define NET_ALARM_TYPE_SB_L1_NIGHT_DRIVING_BAN          1238 //夜间禁行 1级
    // #define NET_ALARM_TYPE_SB_L2_NIGHT_DRIVING_BAN          1239 //夜间禁行 2级
    this.fillObject(rootElement.lang.alarm_name_1238 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "1238", "1288", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1238 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "1239", "1289", "activeSafetyDsm", false, true);	//1


    this.fillObject(rootElement.lang.alarm_name_1410 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "1410", "1460", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1410 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "1411", "1461", "activeSafetyDsm", false, true);	//1


    this.fillObject(rootElement.lang.alarm_name_1416, rootElement.lang.fierce_driving_type, "1416", "1466", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_1417, rootElement.lang.fierce_driving_type, "1417", "1467", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_1418, rootElement.lang.fierce_driving_type, "1418", "1468", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_1419, rootElement.lang.fierce_driving_type, "1419", "1469", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_1420, rootElement.lang.fierce_driving_type, "1420", "1470", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_1421, rootElement.lang.fierce_driving_type, "1421", "1471", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_1422, rootElement.lang.fierce_driving_type, "1422", "1472", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_1423, rootElement.lang.fierce_driving_type, "1423", "1473", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_1424, rootElement.lang.fierce_driving_type, "1424", "1474", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_1425, rootElement.lang.fierce_driving_type, "1425", "1475", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_1426, rootElement.lang.fierce_driving_type, "1426", "1476", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_1427, rootElement.lang.fierce_driving_type, "1427", "1477", "activeSafetyFierce", false, true);    //1

}

/**
 * 主动安全(北京)新增报警
 */
AlarmManager.prototype.addBeiJingAlarm = function () {
    // 北京
    //疲劳驾驶报警 3级
    this.fillObject(rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_33333, rootElement.lang.abnormality, "1200", "1250", "activeSafetyDsm", false, true);	//1
    //分神驾驶报警  3级
    this.fillObject(rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_33333, rootElement.lang.abnormality, "1201", "1251", "activeSafetyDsm", false, true);	//1
    //接打电话报警  3级
    this.fillObject(rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_33333, rootElement.lang.abnormality, "1203", "1253", "activeSafetyDsm", false, true);	//1
    //驾驶员双手脱离方向盘报警3级
    this.fillObject(rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_33333, rootElement.lang.abnormality, "1204", "1254", "activeSafetyDsm", false, true);	//1
    //驾驶员未系安全带报警3级
    this.fillObject(rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_33333, rootElement.lang.abnormality, "1205", "1255", "activeSafetyDsm", false, true);	//1
    //驾驶员异常报警  3级
    this.fillObject(rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_33333, rootElement.lang.abnormality, "1206", "1256", "activeSafetyDsm", false, true);	//1
    //前向碰撞报警 3级
    this.fillObject(rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_33333, rootElement.lang.safetyAdas, "1207", "1257", "activeSafetyAdas", false, true); //1
    //车距过近报警 3级
    this.fillObject(rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_33333, rootElement.lang.safetyAdas, "1208", "1258", "activeSafetyAdas", false, true);	//1
    //车道偏离报警 3级
    this.fillObject(rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_33333, rootElement.lang.safetyAdas, "1209", "1259", "activeSafetyAdas", false, true);	//1
    //行人碰撞报警  3级
    this.fillObject(rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_33333, rootElement.lang.safetyAdas, "1210", "1260", "activeSafetyAdas", false, true);	//1

    this.fillObject(rootElement.lang.alarm_name_1211 + rootElement.lang.alarm_name_11111, rootElement.lang.proximity, "1211", "1261", "activeSafetyProximity", false, true);
    this.fillObject(rootElement.lang.alarm_name_1211 + rootElement.lang.alarm_name_22222, rootElement.lang.proximity, "1212", "1262", "activeSafetyProximity", false, true);
    this.fillObject(rootElement.lang.alarm_name_1211 + rootElement.lang.alarm_name_33333, rootElement.lang.proximity, "1213", "1263", "activeSafetyProximity", false, true);

    // 北标
    this.fillObject(rootElement.lang.alarm_name_1214 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "1214", "1264", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_1214 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "1215", "1265", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_1214 + rootElement.lang.alarm_name_33333, rootElement.lang.safetyAdas, "1216", "1266", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_1217 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "1217", "1267", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_1217 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "1218", "1268", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_1217 + rootElement.lang.alarm_name_33333, rootElement.lang.safetyAdas, "1219", "1269", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_1220 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "1220", "1270", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_1220 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "1221", "1271", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_1220 + rootElement.lang.alarm_name_33333, rootElement.lang.safetyAdas, "1222", "1272", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_1223 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "1223", "1273", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_1223 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "1224", "1274", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_1223 + rootElement.lang.alarm_name_33333, rootElement.lang.safetyAdas, "1225", "1275", "activeSafetyAdas", false, true);
}

/**
 * 渣土车主动安全报警新增报警
 * @param type 1普通类型
 */
AlarmManager.prototype.addMuckAlarm = function (type) {
    if (type && type == 1) {
        this.fillObject(rootElement.lang.alarm_name_448, rootElement.lang.muck_alarm, "448", "498", "muckAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_449, rootElement.lang.muck_alarm, "449", "499", "muckAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_817, rootElement.lang.muck_alarm, "817", "867", "muckAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_818, rootElement.lang.muck_alarm, "818", "868", "muckAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_819, rootElement.lang.muck_alarm, "819", "869", "muckAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_546, rootElement.lang.muck_alarm, "546", "596", "muckAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_547, rootElement.lang.muck_alarm, "547", "597", "muckAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_548, rootElement.lang.muck_alarm, "548", "598", "muckAlarm", false, true);

        this.fillObject(rootElement.lang.alarm_name_1240, rootElement.lang.muck_alarm, "1240", "1290", "muckAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_1241, rootElement.lang.muck_alarm, "1241", "1291", "muckAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_1245, rootElement.lang.muck_alarm, "1245", "1295", "muckAlarm", false, true);
    } else {
        // BSD
        this.fillObject(rootElement.lang.alarm_name_747, rootElement.lang.proximity, "747", "797", "activeSafetyProximity", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_748, rootElement.lang.proximity, "748", "798", "activeSafetyProximity", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_749, rootElement.lang.proximity, "749", "799", "activeSafetyProximity", false, true);	//1

        //ADAS
        this.fillObject(rootElement.lang.alarm_name_839, rootElement.lang.safetyAdas, "839", "889", "activeSafetyAdas", false, true);	//1
    }
}

/**
 * 初始化809报警
 */
AlarmManager.prototype.init809Object = function () {
    //报警分类
    this.fill809Object("0", "alarmClassify", rootElement.lang.alarm_classify);

    /*****安全辅助驾驶报警*****/
    this.fill809Object("alarmClassify", "monitorAlarmAdas", rootElement.lang.monitor_alarm_adas);
    //侧翻预警
    this.fill809Object("monitorAlarmAdas", "433", rootElement.lang.rollover_warning);
    //抽烟警示
    this.fill809Object("monitorAlarmAdas", "176", rootElement.lang.adas_alarm_type_smoking);
    //累计驾驶超时        210
    this.fill809Object("monitorAlarmAdas", "210", rootElement.lang.alarm_type_cumulativeDayDrivingTimeout);
    //急刹车
    this.fill809Object("monitorAlarmAdas", "407", rootElement.lang.adas_slam_brake);
    //疲劳驾驶                  49
    this.fill809Object("monitorAlarmAdas", "49", rootElement.lang.alarm_type_fatigue);
    //手机警示
    this.fill809Object("monitorAlarmAdas", "174", rootElement.lang.adas_alarm_type_phone_warning);
    //胎压报警(ADAS)
    this.fill809Object("monitorAlarmAdas", "168", rootElement.lang.tire_alarm);

    /*****操作报警*****/
    this.fill809Object("alarmClassify", "operateAlarm", rootElement.lang.monitor_alarm_operate);
    //紧急按钮报警        2
    this.fill809Object("operateAlarm", "2", rootElement.lang.alarm_type_ungency_button);

    /*****故障报警*****/
    this.fill809Object("alarmClassify", "monitorAlarmFault", rootElement.lang.monitor_alarm_fault);
    //GNSS模块发生故障报警      202
    this.fill809Object("monitorAlarmFault", "202", rootElement.lang.alarm_type_GNSSModuleFailure);
    //GNSS天线短路      204
    this.fill809Object("monitorAlarmFault", "204", rootElement.lang.alarm_type_GNSSAntennaShort);
    //GNSS天线未接或者剪断 203
    this.fill809Object("monitorAlarmFault", "203", rootElement.lang.alarm_type_GNSSAntennaMissedOrCut);
    //TTS模块故障       208
    this.fill809Object("monitorAlarmFault", "208", rootElement.lang.alarm_type_TTSModuleFailure);
    //车辆VSS故障           215
    this.fill809Object("monitorAlarmFault", "215", rootElement.lang.alarm_type_VSSFailure);
    //摄像头故障     209
    this.fill809Object("monitorAlarmFault", "209", rootElement.lang.alarm_type_cameraMalfunction);
    //终端LCD或者显示器故障  207
    this.fill809Object("monitorAlarmFault", "207", rootElement.lang.alarm_type_LCDorDisplayFailure);

    /*****平台报警*****/
    this.fill809Object("alarmClassify", "monitorAlarmPlatform", rootElement.lang.monitor_alarm_platform);
    //夜间行驶报警        151
    this.fill809Object("monitorAlarmPlatform", "151", rootElement.lang.alarm_type_nightdriving);
    //疲劳驾驶(平台产生)        306
    this.fill809Object("monitorAlarmPlatform", "306", rootElement.lang.alarm_name_306_default);

    /*****视频报警*****/
    this.fill809Object("alarmClassify", "monitorAlarmVideo", rootElement.lang.monitor_alarm_video);
    //视频信号丢失报警
    this.fill809Object("monitorAlarmVideo", "4", rootElement.lang.alarm_type_video_lost);
    //视频信号遮挡报警
    this.fill809Object("monitorAlarmVideo", "5", rootElement.lang.alarm_type_video_mask);

    /*****速度报警*****/
    this.fill809Object("alarmClassify", "monitorAlarmVelocity", rootElement.lang.monitor_alarm_velocity);
    //超速报警          11
    this.fill809Object("monitorAlarmVelocity", "11", rootElement.lang.monitor_alarm_speed);

    /*****围栏报警*****/
    this.fill809Object("alarmClassify", "monitorAlarmFence", rootElement.lang.monitor_alarm_fence);
    //进出路线报警            212
    this.fill809Object("monitorAlarmFence", "212", rootElement.lang.alarm_type_outOfLine);
    //进出区域          211
    this.fill809Object("monitorAlarmFence", "211", rootElement.lang.alarm_type_outOfRegional);
    //路线偏离报警            214
    this.fill809Object("monitorAlarmFence", "214", rootElement.lang.alarm_type_routeDeviation);
    //区域超速报警        200
    this.fill809Object("monitorAlarmFence", "200", rootElement.lang.alarm_type_regionalSpeedingAlarm);

    /*****异常报警*****/
    this.fill809Object("alarmClassify", "monitorAlarmAbnormal", rootElement.lang.monitor_alarm_abnormal);
    //车辆被盗报警            217
    this.fill809Object("monitorAlarmAbnormal", "217", rootElement.lang.alarm_type_antitheftDevice);
    //車輛非法位移報警          218
    this.fill809Object("monitorAlarmAbnormal", "218", rootElement.lang.alarm_type_illegalDisplacement);
    //客车超员报警
    this.fill809Object("monitorAlarmAbnormal", "231", rootElement.lang.alarm_name_231);
    //碰撞侧翻报警        219
    this.fill809Object("monitorAlarmAbnormal", "219", rootElement.lang.alarm_type_rollover);
    // 其他视频设备故障报警 244 countStr44
    this.fill809Object("monitorAlarmAbnormal", "244", rootElement.lang.other_device_error);
    // 异常驾驶 248 countStr47
    this.fill809Object("monitorAlarmAbnormal", "248", rootElement.lang.abnormal_drive);
    //右转盲区异常报警
    this.fill809Object("monitorAlarmAbnormal", "714", rootElement.lang.turn_blind_zone);
    //电源掉电          206
    this.fill809Object("monitorAlarmAbnormal", "206", rootElement.lang.alarm_type_mainPowerFailure);
    //电源欠压          205
    this.fill809Object("monitorAlarmAbnormal", "205", rootElement.lang.alarm_type_mainSupplyUndervoltage);

    /*****硬盘报警*****/
    this.fill809Object("alarmClassify", "monitorAlarmDisk", rootElement.lang.monitor_alarm_disk);
    //硬盘错误报警
    this.fill809Object("monitorAlarmDisk", "10", rootElement.lang.alarm_type_disk_error);

    /*****油量报警*****/
    this.fill809Object("alarmClassify", "monitorAlarmFuel", rootElement.lang.monitor_alarm_fuel);
    //车辆油量异常报警          216
    this.fill809Object("monitorAlarmFuel", "216", rootElement.lang.alarm_type_abnormalFuel);

    /*****主动安全报警*****/
    this.fill809Object("alarmClassify", "monitorAlarmSafety", rootElement.lang.monitor_alarm_safety);
    //  1.高级驾驶辅助系统(ADAS)
    this.fill809Object("monitorAlarmSafety", "subiaoAdas", rootElement.lang.subiao_adas);
    //车道偏离报警1级
    this.fill809Object("subiaoAdas", "602", rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_11111);
    //车道偏离报警 2级
    this.fill809Object("subiaoAdas", "603", rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_22222);
    //前向碰撞报警1级
    this.fill809Object("subiaoAdas", "600", rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_11111);
    //前向碰撞报警 2级
    this.fill809Object("subiaoAdas", "601", rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_22222);
    //道路标识超限报警 2级
    this.fill809Object("subiaoAdas", "610", rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_11111);
    //道路标识超限报警 1级
    this.fill809Object("subiaoAdas", "611", rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_22222);
    //频繁变道  2级
    this.fill809Object("subiaoAdas", "608", rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_11111);
    //频繁变道  1级
    this.fill809Object("subiaoAdas", "609", rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_22222);
    //行人碰撞报警  2级
    this.fill809Object("subiaoAdas", "606", rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_11111);
    //行人碰撞报警  1级
    this.fill809Object("subiaoAdas", "607", rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_22222);
    //车距过近报警 2级
    this.fill809Object("subiaoAdas", "604", rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_11111);
    //车距过近报警 1级
    this.fill809Object("subiaoAdas", "605", rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_22222);
    //障碍物报警 2级
    this.fill809Object("subiaoAdas", "612", rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_11111);
    //障碍物报警 1级
    this.fill809Object("subiaoAdas", "613", rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_22222);
    // 715    //驾驶辅助功能失效报警1级
    this.fill809Object("subiaoAdas", "715", rootElement.lang.alarm_name_715 + rootElement.lang.alarm_name_11111);
    //驾驶辅助功能失效报警2级
    this.fill809Object("subiaoAdas", "716", rootElement.lang.alarm_name_715 + rootElement.lang.alarm_name_22222);
    //  1.激烈驾驶报警
    this.fill809Object("monitorAlarmSafety", "monitorAlarmIntenseDrive", rootElement.lang.monitor_alarm_intense_drive);
    this.fill809Object("monitorAlarmIntenseDrive", "720", rootElement.lang.alarm_name_720);
    this.fill809Object("monitorAlarmIntenseDrive", "721", rootElement.lang.alarm_name_721);
    this.fill809Object("monitorAlarmIntenseDrive", "722", rootElement.lang.alarm_name_722);
    this.fill809Object("monitorAlarmIntenseDrive", "723", rootElement.lang.alarm_name_723);
    this.fill809Object("monitorAlarmIntenseDrive", "724", rootElement.lang.alarm_name_724);
    this.fill809Object("monitorAlarmIntenseDrive", "725", rootElement.lang.alarm_name_725);
    this.fill809Object("monitorAlarmIntenseDrive", "726", rootElement.lang.alarm_name_726);
    //  1.驾驶员状态监控系统(DSM)
    this.fill809Object("monitorAlarmSafety", "subiaoDsm", rootElement.lang.subiao_dsm);
    //疲劳驾驶报警 1级
    this.fill809Object("subiaoDsm", "618", rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_11111);
    //疲劳驾驶报警 2级
    this.fill809Object("subiaoDsm", "619", rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_22222);
    //接打电话报警  1级
    this.fill809Object("subiaoDsm", "620", rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_11111);
    //接打电话报警  2级
    this.fill809Object("subiaoDsm", "621", rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_22222);
    //抽烟报警  1级
    this.fill809Object("subiaoDsm", "622", rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_11111);
    //抽烟报警  2级
    this.fill809Object("subiaoDsm", "623", rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_22222);
    //分神驾驶报警  1级
    this.fill809Object("subiaoDsm", "624", rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_11111);
    //分神驾驶报警  2级
    this.fill809Object("subiaoDsm", "625", rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_22222);
    //驾驶员异常报警  1级
    this.fill809Object("subiaoDsm", "626", rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_11111);
    //驾驶员异常报警  2级
    this.fill809Object("subiaoDsm", "627", rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_22222);
    //墨镜失效一级报警
    this.fill809Object("subiaoDsm", "639", rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_11111);
    //墨镜失效2级报警
    this.fill809Object("subiaoDsm", "640", rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_22222);
    //驾驶员IC卡异常报警1级
    this.fill809Object("subiaoDsm", "641", rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_11111);
    //驾驶员IC卡异常报警2级
    this.fill809Object("subiaoDsm", "642", rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_22222);
    //长时间不目视前方报警1级
    this.fill809Object("subiaoDsm", "702", rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_11111);
    //长时间不目视前方报警2级
    this.fill809Object("subiaoDsm", "703", rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_22222);
    this.fill809Object("subiaoDsm", "738", rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_11111);
    this.fill809Object("subiaoDsm", "739", rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_22222);
    this.fill809Object("subiaoDsm", "736", rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_11111);
    this.fill809Object("subiaoDsm", "737", rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_22222);
    this.fill809Object("subiaoDsm", "719", rootElement.lang.alarm_name_719);
    //// 717 //驾驶员行为监测功能失效报警1级
    this.fill809Object("subiaoDsm", "717", rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_11111);
    this.fill809Object("subiaoDsm", "718", rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_22222);
    //驾驶员未系安全带报警1级
    this.fill809Object("subiaoDsm", "706", rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_11111);
    //驾驶员未系安全带报警2级
    this.fill809Object("subiaoDsm", "707", rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_22222);
    //驾驶员不在驾驶位报警1级
    this.fill809Object("subiaoDsm", "708", rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_11111);
    //驾驶员不在驾驶位报警2级
    this.fill809Object("subiaoDsm", "709", rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_22222);
    //驾驶员双手脱离方向盘报警1级
    this.fill809Object("subiaoDsm", "710", rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_11111);
    //驾驶员双手脱离方向盘报警2级
    this.fill809Object("subiaoDsm", "711", rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_22222);
    this.fill809Object("subiaoDsm", "734", rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_11111);
    this.fill809Object("subiaoDsm", "735", rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_22222);
    //  1.轮胎气压监测系统(TPMS)
    this.fill809Object("monitorAlarmSafety", "tirePressureMonitoringSystem", rootElement.lang.tire_pressure_monitoring_system);
    //胎压报警
    this.fill809Object("tirePressureMonitoringSystem", "632", rootElement.lang.alarm_name_632);
    //  1.盲点监测系统(BSD)
    this.fill809Object("monitorAlarmSafety", "blindSpotMonitoringSystem", rootElement.lang.blind_spot_monitoring_system);
    //后方接近报警
    this.fill809Object("blindSpotMonitoringSystem", "633", rootElement.lang.alarm_name_633);
    //左侧后方接近报警
    this.fill809Object("blindSpotMonitoringSystem", "634", rootElement.lang.alarm_name_634);
    //右侧后方接近报警
    this.fill809Object("blindSpotMonitoringSystem", "635", rootElement.lang.alarm_name_635);
    //  1.智能检测报警
    this.fill809Object("monitorAlarmSafety", "intelligentDetectionAndAlarm", rootElement.lang.intelligent_detection_and_alarm);
    this.fill809Object("intelligentDetectionAndAlarm", "740", rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_11111);
    this.fill809Object("intelligentDetectionAndAlarm", "741", rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_22222);
    this.fill809Object("intelligentDetectionAndAlarm", "742", rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_11111);
    this.fill809Object("intelligentDetectionAndAlarm", "743", rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_22222);
}

/**
 * 809报警初始化数据信息
 * @param parentId
 * @param itemId
 * @param itemName
 */
AlarmManager.prototype.fill809Object = function (parentId, itemId, itemName) {
    var obj = {};
    obj.name = itemName;
    obj.id = itemId;
    obj.parentId = parentId;
    this.lst809AlarmTypeOjbect.push(obj);
}

/**
 *
 * @param alarmType  报警类型  10 G-SenSor 9 主动安全  3 AI报警  2 日报表相关报警  1 渣土车
 * isAccessory 附件获取功能
 *
 *
 */
AlarmManager.prototype.initObject = function (alarmType, hideEvent, isAccessory) {
    // 轨迹回放显示地图标识的报警列表
    if (alarmType === 'trackBackShowMap') {
        //疲劳驾驶                  49
        this.fillObject(rootElement.lang.alarm_type_fatigue, rootElement.lang.over_speed_or_tired, "49", "99", "speendAlarm", false, true);    //1
        //疲劳驾驶预警
        this.fillObject(rootElement.lang.fatigue_warning, rootElement.lang.over_speed_or_tired, "429", "479", "speendAlarm", false, true);
        //超速报警          11
        this.fillObject(rootElement.lang.monitor_alarm_speed, rootElement.lang.over_speed_or_tired, "11", "61", "speendAlarm", false, true);    //1
        //TODO 警情统计
        this.fillObject(rootElement.lang.over_speed_warning, rootElement.lang.over_speed_or_tired, "428", "478", "speendAlarm", false, true);	//1
        //进出区域          211
        this.fillObject(rootElement.lang.alarm_type_outOfRegional, rootElement.lang.monitor_alarm_fence, "211", "261", "fenceAlarm", true, true);   //1
        return;
    }

    // 报警屏蔽或者报警联动； 未定义的状态位报警 不录像
    // 补加一些报警状态位的屏蔽，没有报警。无报警联动
    if (alarmType === 'AlarmMaskLinkage') {
        this.fillObject(rootElement.lang.alarm_type_no_record, rootElement.lang.monitor_alarm_otherAlarm, "-100", "", "otherAlarm", false, true);   //1
    }
    // 日报表内统计的自带
    if (alarmType === 'dailySummary') {
        this.fillObject(rootElement.lang.over_speed_warning, rootElement.lang.over_speed_or_tired, "428", "478", "speendAlarm", false, true);   //1
        //自定义报警         1
        this.fillObject(rootElement.lang.alarm_type_custom_alarm, rootElement.lang.monitor_alarm_otherAlarm, "1", "", "otherAlarm", false, true);   //1
        //紧急按钮报警        2
        this.fillObject(rootElement.lang.alarm_type_ungency_button, rootElement.lang.monitor_alarm_operate, "2", "52", "operateAlarm", true, true);
        //区域超速报警        200
        this.fillObject(rootElement.lang.alarm_type_regionalSpeedingAlarm, rootElement.lang.monitor_alarm_fence, "200", "250", "fenceAlarm", false, true);  //1
        //危险驾驶行为报警              201
        this.fillObject(rootElement.lang.alarm_type_earlyWarning, rootElement.lang.monitor_alarm_otherAlarm, "201", "251", "otherAlarm", false, true);  //1
        //GNSS模块发生故障报警      202
        this.fillObject(rootElement.lang.alarm_type_GNSSModuleFailure, rootElement.lang.monitor_alarm_fault, "202", "252", "faultAlarm", false, true);  //1
        //GNSS天线未接或者剪断 203
        this.fillObject(rootElement.lang.alarm_type_GNSSAntennaMissedOrCut, rootElement.lang.monitor_alarm_fault, "203", "253", "faultAlarm", false, true); //1
        //GNSS天线短路      204
        this.fillObject(rootElement.lang.alarm_type_GNSSAntennaShort, rootElement.lang.monitor_alarm_fault, "204", "254", "faultAlarm", false, true);   //1
        //电源欠压          205
        this.fillObject(rootElement.lang.alarm_type_mainSupplyUndervoltage, rootElement.lang.monitor_alarm_otherAlarm, "205", "255", "otherAlarm", false, true);    //1
        //电源掉电          206
        this.fillObject(rootElement.lang.alarm_type_mainPowerFailure, rootElement.lang.monitor_alarm_otherAlarm, "206", "256", "otherAlarm", false, true);  //1
        //终端LCD或者显示器故障  207
        this.fillObject(rootElement.lang.alarm_type_LCDorDisplayFailure, rootElement.lang.monitor_alarm_fault, "207", "257", "faultAlarm", false, true);    //1
        //TTS模块故障       208
        this.fillObject(rootElement.lang.alarm_type_TTSModuleFailure, rootElement.lang.monitor_alarm_fault, "208", "258", "faultAlarm", false, true);   //1
        //摄像头故障     209
        this.fillObject(rootElement.lang.alarm_type_cameraMalfunction, rootElement.lang.monitor_alarm_fault, "209", "259", "faultAlarm", false, true);  //1
        //累计驾驶超时        210
        this.fillObject(rootElement.lang.alarm_type_cumulativeDayDrivingTimeout, rootElement.lang.monitor_alarm_otherAlarm, "210", "260", "otherAlarm", false, true);   //1
        //停车过长报警        14
        this.fillObject(rootElement.lang.alarm_type_overtimeParking, rootElement.lang.monitor_alarm_otherAlarm, "14", "64", "otherAlarm", false, true); //1
        //进出区域          211
        this.fillObject(rootElement.lang.alarm_type_outOfRegional, rootElement.lang.monitor_alarm_fence, "211", "261", "fenceAlarm", true, true);   //1
        //进出路线报警            212
        this.fillObject(rootElement.lang.alarm_type_outOfLine, rootElement.lang.monitor_alarm_fence, "212", "262", "fenceAlarm", false, true);  //1
        //路段行驶时间过长/过短   213
        this.fillObject(rootElement.lang.alarm_type_InadequateOrTooLongRoadTravelTime, rootElement.lang.monitor_alarm_fence, "213", "263", "fenceAlarm", false, true);  //1
        //路线偏离报警            214
        this.fillObject(rootElement.lang.alarm_type_routeDeviation, rootElement.lang.monitor_alarm_fence, "214", "264", "fenceAlarm", false, true); //1
        //车辆VSS故障           215
        this.fillObject(rootElement.lang.alarm_type_VSSFailure, rootElement.lang.monitor_alarm_fault, "215", "265", "faultAlarm", false, true); //1
        //车辆油量异常报警          216
        this.fillObject(rootElement.lang.alarm_type_abnormalFuel, rootElement.lang.monitor_alarm_fuel, "216", "266", "fuelAlarm", false, true); //1
        //车辆被盗报警            217
        this.fillObject(rootElement.lang.alarm_type_antitheftDevice, rootElement.lang.monitor_alarm_otherAlarm, "217", "267", "otherAlarm", false, true);   //1
        //车辆非法点火报警      8
        this.fillObject(rootElement.lang.alarm_type_illegalIgnition, rootElement.lang.monitor_alarm_otherAlarm, "8", "58", "otherAlarm", false, true);  //1
        //車輛非法位移報警          218
        this.fillObject(rootElement.lang.alarm_type_illegalDisplacement, rootElement.lang.monitor_alarm_otherAlarm, "218", "268", "otherAlarm", false, true);   //1
        //碰撞侧翻报警        219
        this.fillObject(rootElement.lang.alarm_type_rollover, rootElement.lang.alarm_GSensor_type, "219", "269", "gSensor", false, true);   //1
        //夜间行驶报警        151
        this.fillObject(rootElement.lang.alarm_type_nightdriving, rootElement.lang.monitor_alarm_platform, "151", "152", "platformAlarm", false, true); //1
        //超速报警          11
        this.fillObject(rootElement.lang.monitor_alarm_speed, rootElement.lang.over_speed_or_tired, "11", "61", "speendAlarm", false, true);    //1
        //非法开门报警        6
        this.fillObject(rootElement.lang.alarm_type_door_open_lawless, rootElement.lang.monitor_alarm_operate, "6", "56", "operateAlarm", false, true); //1
        //区域超速报警(平台产生)  300
        this.fillObject(rootElement.lang.alarm_type_areaOverSpeed_platform, rootElement.lang.monitor_alarm_platform, "300", "350", "platformAlarm", false, true);   //1
        //区域低速报警(平台产生)  301
        this.fillObject(rootElement.lang.alarm_type_areaLowSpeed_platform, rootElement.lang.monitor_alarm_platform, "301", "351", "platformAlarm", false, true);    //1
        //进出入区域(平台产生)       302
        this.fillObject(rootElement.lang.alarm_type_areaInOut_platform, rootElement.lang.monitor_alarm_platform, "302", "352", "platformAlarm", true, true);    //1
        //线路偏移(平台产生)        303
        this.fillObject(rootElement.lang.alarm_type_lineInOut_platform, rootElement.lang.monitor_alarm_platform, "303", "353", "platformAlarm", false, true);   //1
        //时间段超速报警(平台产生) 304
        this.fillObject(rootElement.lang.alarm_type_overSpeed_platform, rootElement.lang.monitor_alarm_platform, "304", "354", "platformAlarm", false, true);   //1
        //时间段低速报警(平台产生)     305
        this.fillObject(rootElement.lang.alarm_type_lowSpeed_platform, rootElement.lang.monitor_alarm_platform, "305", "355", "platformAlarm", false, true);    //1
        //累计疲劳(平台)
        this.fillObject(rootElement.lang.alarm_name_1121, rootElement.lang.monitor_alarm_platform, "1121", null, "platformAlarm", false, true);
        //日间疲劳(平台)
        this.fillObject(rootElement.lang.alarm_name_1126, rootElement.lang.monitor_alarm_platform, "1126", null, "platformAlarm", false, true);
        //夜间疲劳(平台)
        this.fillObject(rootElement.lang.alarm_name_1127, rootElement.lang.monitor_alarm_platform, "1127", null, "platformAlarm", false, true);
        //日间疲劳(平台)结束
        this.fillObject(rootElement.lang.alarm_name_1128, rootElement.lang.monitor_alarm_platform, "1128", null, "platformAlarm", false, true);
        //夜间疲劳(平台)结束
        this.fillObject(rootElement.lang.alarm_name_1129, rootElement.lang.monitor_alarm_platform, "1129", null, "platformAlarm", false, true);
        //客运车辆禁止
        this.fillObject(rootElement.lang.alarm_name_220, rootElement.lang.monitor_alarm_platform, "220", null, "platformAlarm", false, true);
        //山区公路禁止
        this.fillObject(rootElement.lang.alarm_name_221, rootElement.lang.monitor_alarm_platform, "221", null, "platformAlarm", false, true);
        //客车超员报警
        this.fillObject(rootElement.lang.alarm_name_231, rootElement.lang.monitor_alarm_platform, "231", null, "platformAlarm", false, true);
        //疲劳驾驶预警(平台)       1109
        this.fillObject(rootElement.lang.alarm_name_1109, rootElement.lang.monitor_alarm_platform, "1109", null, "platformAlarm", false, true);  //1
        //疲劳驾驶(平台产生)        306
        this.fillObject(rootElement.lang.alarm_name_306_default, rootElement.lang.monitor_alarm_platform, "306", "356", "platformAlarm", false, true);  //1
        //超时停车(平台产生)        307
        this.fillObject(rootElement.lang.alarm_type_parkTooLong_platform, rootElement.lang.monitor_alarm_platform, "307", "357", "platformAlarm", false, true); //1
        //关键点监控报警(平台产生) 308
        this.fillObject(rootElement.lang.alarm_type_areaPoint_platform, rootElement.lang.monitor_alarm_platform, "308", "358", "platformAlarm", false, true);   //1
        //线路超速报警(平台产生)  309
        this.fillObject(rootElement.lang.alarm_type_lineOverSpeed_platform, rootElement.lang.monitor_alarm_platform, "309", "359", "platformAlarm", false, true);   //1
        //线路低速报警(平台产生)  310
        this.fillObject(rootElement.lang.alarm_type_lineLowSpeed_platform, rootElement.lang.monitor_alarm_platform, "310", "360", "platformAlarm", false, true);    //1
        //道路等级超速报警(平台产生) 311
        this.fillObject(rootElement.lang.report_roadLvlOverSpeed_platform, rootElement.lang.monitor_alarm_platform, "311", "361", "platformAlarm", false, true);    //1
        //道路等级超速预警(平台产生) 1333
        this.fillObject(rootElement.lang.report_roadLvlOverSpeedWarning_platform, rootElement.lang.monitor_alarm_platform, "1333", null, "platformAlarm", false, true);    //1
        //疲劳驾驶                  49
        this.fillObject(rootElement.lang.alarm_type_fatigue, rootElement.lang.over_speed_or_tired, "49", "99", "speendAlarm", false, true);    //1
        //面部疲劳                  249
        this.fillObject(rootElement.lang.face_fatigue, rootElement.lang.monitor_alarm_adas, "249", "299", "adasAlarm", false, true);    //1
        //夜间超速(平台产生)        314
        this.fillObject(rootElement.lang.alarm_type_night_overSpeed_platform, rootElement.lang.monitor_alarm_platform, "314", "364", "platformAlarm", false, true); //1
        //TODO 警情统计
        this.fillObject(rootElement.lang.module_failure, rootElement.lang.monitor_alarm_fault, "712", "762", "faultAlarm", false, true);    //1
        //疲劳驾驶预警
        this.fillObject(rootElement.lang.fatigue_warning, rootElement.lang.over_speed_or_tired, "429", "479", "speendAlarm", false, true);
        //前撞预警
        this.fillObject(rootElement.lang.forward_collosion_warning, rootElement.lang.monitor_alarm_adas, "430", "480", "adasAlarm", false, true);
        //车道偏移预警
        this.fillObject(rootElement.lang.lane_offset_warning, rootElement.lang.monitor_alarm_adas, "431", "481", "adasAlarm", false, true);
        //胎压预警
        this.fillObject(rootElement.lang.tire_warning, rootElement.lang.monitor_alarm_adas, "432", "482", "adasAlarm", false, true);
        //侧翻预警
        this.fillObject(rootElement.lang.rollover_warning, rootElement.lang.monitor_alarm_adas, "433", "483", "adasAlarm", false, true);
        //违规行驶
        this.fillObject(rootElement.lang.driving_violations, rootElement.lang.monitor_alarm_adas, "713", "763", "adasAlarm", false, true);
        //右转盲区异常报警
        this.fillObject(rootElement.lang.turn_blind_zone, rootElement.lang.monitor_alarm_adas, "714", "764", "adasAlarm", false, true);
        //ACC信号异常报警(平台)
        this.fillObject(rootElement.lang.acc_signal_abnormal, rootElement.lang.monitor_alarm_platform, "326", "376", "platformAlarm", false, true); //1
        //位置信息异常报警(平台)
        this.fillObject(rootElement.lang.position_abnormal_alarm, rootElement.lang.monitor_alarm_platform, "327", "377", "platformAlarm", false, true); //1
        //车辆长时异常离线提醒(平台)
        this.fillObject(rootElement.lang.offline_abnormal_alarm, rootElement.lang.monitor_alarm_platform, "328", "378", "platformAlarm", false, true);  //1
        // 离线位移 136
        this.fillObject(rootElement.lang.report_abnormalPosition_platform, rootElement.lang.monitor_alarm_platform, "136", "", "platformAlarm", false, true);   //1
        //ADAS类
        //前向碰撞报警1级
        this.fillObject(rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "600", "650", "activeSafetyAdas", false, true); //1
        //前向碰撞报警 2级
        this.fillObject(rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "601", "651", "activeSafetyAdas", false, true); //1
        //车道偏离报警1级
        this.fillObject(rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "602", "652", "activeSafetyAdas", false, true); //1
        //车道偏离报警 2级
        this.fillObject(rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "603", "653", "activeSafetyAdas", false, true); //1
        //车距过近报警 1级
        this.fillObject(rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "604", "654", "activeSafetyAdas", false, true); //1
        //车距过近报警 2级
        this.fillObject(rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "605", "655", "activeSafetyAdas", false, true); //1
        //行人碰撞报警  1级
        this.fillObject(rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "606", "656", "activeSafetyAdas", false, true); //1
        //行人碰撞报警  2级
        this.fillObject(rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "607", "657", "activeSafetyAdas", false, true); //1
        //频繁变道  1级
        this.fillObject(rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "608", "658", "activeSafetyAdas", false, true); //1
        //频繁变道  2级
        this.fillObject(rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "609", "659", "activeSafetyAdas", false, true); //1
        //道路标识超限报警 1级
        this.fillObject(rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "610", "660", "activeSafetyAdas", false, true); //1
        //道路标识超限报警 2级
        this.fillObject(rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "611", "661", "activeSafetyAdas", false, true); //1
        //障碍物报警 1级
        this.fillObject(rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "612", "662", "activeSafetyAdas", false, true); //1
        //障碍物报警 2级
        this.fillObject(rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "613", "663", "activeSafetyAdas", false, true); //1
        //弯道车速预警1级
        this.fillObject(rootElement.lang.alarm_name_700 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "700", "750", "activeSafetyAdas", false, true); //1
        //弯道车速预警2级
        this.fillObject(rootElement.lang.alarm_name_700 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "701", "751", "activeSafetyAdas", false, true); //1
        // 715    //驾驶辅助功能失效报警1级
        this.fillObject(rootElement.lang.alarm_name_715 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "715", "765", "activeSafetyAdas", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_715 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "716", "766", "activeSafetyAdas", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_728 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "728", "778", "activeSafetyAdas", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_728 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "729", "779", "activeSafetyAdas", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_730 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "730", "780", "activeSafetyAdas", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_730 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "731", "781", "activeSafetyAdas", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_732 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "732", "782", "activeSafetyAdas", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_732 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "733", "783", "activeSafetyAdas", false, true); //1

        this.fillObject(rootElement.lang.alarm_name_542 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "542", "592", "activeSafetyAdas", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_542 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "543", "593", "activeSafetyAdas", false, true); //1
        //疲劳驾驶报警 1级
        this.fillObject(rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "618", "668", "activeSafetyDsm", false, true);
        //疲劳驾驶报警 2级
        this.fillObject(rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "619", "669", "activeSafetyDsm", false, true);
        //接打电话报警  1级
        this.fillObject(rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "620", "670", "activeSafetyDsm", false, true); //1
        //接打电话报警  2级
        this.fillObject(rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "621", "671", "activeSafetyDsm", false, true); //1
        //抽烟报警  1级
        this.fillObject(rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "622", "672", "activeSafetyDsm", false, true); //1
        //抽烟报警  2级
        this.fillObject(rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "623", "673", "activeSafetyDsm", false, true); //1
        //分神驾驶报警  1级
        this.fillObject(rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "624", "674", "activeSafetyDsm", false, true); //1
        //分神驾驶报警  2级
        this.fillObject(rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "625", "675", "activeSafetyDsm", false, true); //1
        //驾驶员异常报警  1级
        this.fillObject(rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "626", "676", "activeSafetyDsm", false, true); //1
        //驾驶员异常报警  2级
        this.fillObject(rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "627", "677", "activeSafetyDsm", false, true); //1
        //墨镜失效一级报警
        this.fillObject(rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "639", "689", "activeSafetyDsm", false, true); //1
        //墨镜失效2级报警
        this.fillObject(rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "640", "690", "activeSafetyDsm", false, true); //1
        //驾驶员IC卡异常报警1级
        this.fillObject(rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "641", "691", "activeSafetyDsm", false, true); //1
        //驾驶员IC卡异常报警2级
        this.fillObject(rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "642", "692", "activeSafetyDsm", false, true); //1
        ////喝水报警 1级
        this.fillObject(rootElement.lang.alarm_name_644 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "644", "694", "activeSafetyDsm", false, true); //1
        ////喝水报警 2级
        this.fillObject(rootElement.lang.alarm_name_644 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "645", "695", "activeSafetyDsm", false, true); //1
        //单手脱离方向盘
        this.fillObject(rootElement.lang.alarm_name_745 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "745", "795", "activeSafetyDsm", false, true);
        this.fillObject(rootElement.lang.alarm_name_745 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "746", "796", "activeSafetyDsm", false, true);
        //长时间不目视前方报警1级
        this.fillObject(rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "702", "752", "activeSafetyDsm", false, true); //1
        //长时间不目视前方报警2级
        this.fillObject(rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "703", "753", "activeSafetyDsm", false, true); //1
        //系统不能正常工作报警1级
        this.fillObject(rootElement.lang.alarm_name_704 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "704", "754", "activeSafetyDsm", false, true); //1
        //系统不能正常工作报警2级
        this.fillObject(rootElement.lang.alarm_name_704 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "705", "755", "activeSafetyDsm", false, true); //1
        //驾驶员未系安全带报警1级
        this.fillObject(rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "706", "756", "activeSafetyDsm", false, true); //1
        //驾驶员未系安全带报警2级
        this.fillObject(rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "707", "757", "activeSafetyDsm", false, true); //1
        //驾驶员不在驾驶位报警1级
        this.fillObject(rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "708", "758", "activeSafetyDsm", false, true); //1
        //驾驶员不在驾驶位报警2级
        this.fillObject(rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "709", "759", "activeSafetyDsm", false, true); //1
        //驾驶员双手脱离方向盘报警1级
        this.fillObject(rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "710", "760", "activeSafetyDsm", false, true); //1
        //驾驶员双手脱离方向盘报警2级
        this.fillObject(rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "711", "761", "activeSafetyDsm", false, true); //1
        //// 717 //驾驶员行为监测功能失效报警1级
        this.fillObject(rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "717", "767", "activeSafetyDsm", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "718", "768", "activeSafetyDsm", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "734", "784", "activeSafetyDsm", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "735", "785", "activeSafetyDsm", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "736", "786", "activeSafetyDsm", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "737", "787", "activeSafetyDsm", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "738", "788", "activeSafetyDsm", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "739", "789", "activeSafetyDsm", false, true); //1

        //tmps 胎压
        //胎压报警
        this.fillObject(rootElement.lang.alarm_name_632, rootElement.lang.tmps, "632", "682", "activeSafetyTmps", false, true); //1
        //BDS接近报警
        //后方接近报警
        this.fillObject(rootElement.lang.alarm_name_633, rootElement.lang.proximity, "633", "683", "activeSafetyProximity", false, true);   //1
        //左侧后方接近报警
        this.fillObject(rootElement.lang.alarm_name_634, rootElement.lang.proximity, "634", "684", "activeSafetyProximity", false, true);   //1
        //右侧后方接近报警
        this.fillObject(rootElement.lang.alarm_name_635, rootElement.lang.proximity, "635", "685", "activeSafetyProximity", false, true);   //1
        //激烈驾驶
        //激烈驾驶报警(川标)
        this.fillObject(rootElement.lang.alarm_name_720, rootElement.lang.fierce_driving_type, "720", "770", "activeSafetyFierce", false, true);    //1
        this.fillObject(rootElement.lang.alarm_name_721, rootElement.lang.fierce_driving_type, "721", "771", "activeSafetyFierce", false, true);    //1
        this.fillObject(rootElement.lang.alarm_name_722, rootElement.lang.fierce_driving_type, "722", "772", "activeSafetyFierce", false, true);    //1
        this.fillObject(rootElement.lang.alarm_name_723, rootElement.lang.fierce_driving_type, "723", "773", "activeSafetyFierce", false, true);    //1
        this.fillObject(rootElement.lang.alarm_name_724, rootElement.lang.fierce_driving_type, "724", "774", "activeSafetyFierce", false, true);    //1
        this.fillObject(rootElement.lang.alarm_name_725, rootElement.lang.fierce_driving_type, "725", "775", "activeSafetyFierce", false, true);    //1
        this.fillObject(rootElement.lang.alarm_name_726, rootElement.lang.fierce_driving_type, "726", "776", "activeSafetyFierce", false, true);    //1
        //智能检测
        this.fillObject(rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_11111, rootElement.lang.znjc, "740", "790", "activeSafetyZnjc", false, true);   //1
        this.fillObject(rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_22222, rootElement.lang.znjc, "741", "791", "activeSafetyZnjc", false, true);   //1
        this.fillObject(rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_11111, rootElement.lang.znjc, "742", "792", "activeSafetyZnjc", false, true);   //1
        this.fillObject(rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_22222, rootElement.lang.znjc, "743", "793", "activeSafetyZnjc", false, true);   //1
        //卫星定位报警(川标)
        this.fillObject(rootElement.lang.alarm_name_727, rootElement.lang.satellite_positioning_type, "727", "777", "activeSafetySatellite", false, true);  //1
        this.fillObject(rootElement.lang.alarm_name_744, rootElement.lang.satellite_positioning_type, "744", "794", "activeSafetySatellite", false, true);  //1
        return;
    }

    if (alarmType === 12) {
        //正转
        this.fillObject(rootElement.lang.alarm_name_1000, rootElement.lang.monitor_alarm_otherAlarm, "1000", "1050", "otherAlarm", false, true);
        //反转
        this.fillObject(rootElement.lang.alarm_name_1001, rootElement.lang.monitor_alarm_otherAlarm, "1001", "1051", "otherAlarm", false, true);
        return;
    }

    //G-sensor报警类型
    if (alarmType === 11) {
        //GSensor启动
        this.fillObject(rootElement.lang.alarm_GSensorStart, rootElement.lang.alarm_GSensor_type, "439", "489", "gSensor", false, true);
        //GSensor停止
        this.fillObject(rootElement.lang.alarm_GSensorStop, rootElement.lang.alarm_GSensor_type, "440", "490", "gSensor", false, true);
        //急加速
        this.fillObject(rootElement.lang.alarm_type_rapidAcceleration, rootElement.lang.monitor_alarm_otherAlarm, "246", "296", "otherAlarm", false, true);
        //急减速
        this.fillObject(rootElement.lang.alarm_type_rapidDeceleration, rootElement.lang.monitor_alarm_otherAlarm, "247", "297", "otherAlarm", false, true);
        //急转弯
        this.fillObject(rootElement.lang.alarm_type_sharpTurn, rootElement.lang.alarm_GSensor_type, "444", "494", "gSensor", false, true);
        //碰撞侧翻报警
        this.fillObject(rootElement.lang.alarm_type_rollover, rootElement.lang.alarm_GSensor_type, "219", "269", "gSensor", false, true);
        //GSensor侧翻
        this.fillObject(rootElement.lang.alarm_GSensorRollOver, rootElement.lang.alarm_GSensor_type, "441", "491", "gSensor", false, true);
        return;
    }

    //二级报警相关报警规则加载报警类型
    // 包含二级报警
    if (alarmType === 9) {
        //再细分类
        //adas相关的
        //低速前车碰撞预警1级
        this.fillObject(rootElement.lang.alarm_name_840 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "840", "890", "activeSafetyAdas", false, true); //1
        //低速前车碰撞预警 2级
        this.fillObject(rootElement.lang.alarm_name_840 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "841", "891", "activeSafetyAdas", false, true); //1
        // 前向碰撞报警1级
        this.fillObject(rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "600", "650", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "601", "651", "activeSafetyAdas", false, true); //1
        // 车道偏离报警1级
        this.fillObject(rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "602", "652", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "603", "653", "activeSafetyAdas", false, true); //1
        // 车距过近报警 1级
        this.fillObject(rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "604", "654", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "605", "655", "activeSafetyAdas", false, true); //1
        // 行人碰撞报警  1级
        this.fillObject(rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "606", "656", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "607", "657", "activeSafetyAdas", false, true); //1
        // 频繁变道  1级
        this.fillObject(rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "608", "658", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "609", "659", "activeSafetyAdas", false, true); //1
        //道路标识超限报警 1级
        this.fillObject(rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "610", "660", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "611", "661", "activeSafetyAdas", false, true); //1
        // 障碍物报警 1级
        this.fillObject(rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "612", "662", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "613", "663", "activeSafetyAdas", false, true); //1
        // 弯道车速预警1级
        this.fillObject(rootElement.lang.alarm_name_700 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "700", "750", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_700 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "701", "751", "activeSafetyAdas", false, true); //1
        // 驾驶辅助功能失效报警1级
        this.fillObject(rootElement.lang.alarm_name_715 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "715", "765", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_715 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "716", "766", "activeSafetyAdas", false, true); //1
        // 路口快速通过报警1级
        this.fillObject(rootElement.lang.alarm_name_728 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "728", "778", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_728 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "729", "779", "activeSafetyAdas", false, true); //1
        // 实线变道报警1级
        this.fillObject(rootElement.lang.alarm_name_730 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "730", "780", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_730 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "731", "781", "activeSafetyAdas", false, true); //1
        // 设备失效提醒报警1级
        this.fillObject(rootElement.lang.alarm_name_732 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "732", "782", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_732 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "733", "783", "activeSafetyAdas", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_542 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "542", "592", "activeSafetyAdas", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_542 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "543", "593", "activeSafetyAdas", false, true); //1

        // 黑车报警
        this.fillObject(rootElement.lang.alarm_name_530 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "530", "580", "activeSafetyAdas", false, true);
        this.fillObject(rootElement.lang.alarm_name_530 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "531", "581", "activeSafetyAdas", false, true);
        this.fillObject(rootElement.lang.alarm_name_532 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "532", "582", "activeSafetyAdas", false, true);
        this.fillObject(rootElement.lang.alarm_name_532 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "533", "583", "activeSafetyAdas", false, true);
        this.fillObject(rootElement.lang.alarm_name_534 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "534", "584", "activeSafetyAdas", false, true);
        this.fillObject(rootElement.lang.alarm_name_534 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "535", "585", "activeSafetyAdas", false, true);
        this.fillObject(rootElement.lang.alarm_name_536 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "536", "586", "activeSafetyAdas", false, true);
        this.fillObject(rootElement.lang.alarm_name_536 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "537", "587", "activeSafetyAdas", false, true);

        //dsm相关的
        //疲劳驾驶报警 1级
        this.fillObject(rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "618", "668", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "619", "669", "activeSafetyDsm", false, true);
        //接打电话报警  1级
        this.fillObject(rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "620", "670", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "621", "671", "activeSafetyDsm", false, true); //1
        //抽烟报警  1级
        this.fillObject(rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "622", "672", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "623", "673", "activeSafetyDsm", false, true); //1
        //分神驾驶报警  1级
        this.fillObject(rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "624", "674", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "625", "675", "activeSafetyDsm", false, true); //1
        //驾驶员异常报警  1级
        this.fillObject(rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "626", "676", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "627", "677", "activeSafetyDsm", false, true); //1
        //长时间不目视前方报警1级
        this.fillObject(rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "702", "752", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "703", "753", "activeSafetyDsm", false, true); //1
        // 系统不能正常工作报警1级
        this.fillObject(rootElement.lang.alarm_name_704 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "704", "754", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_704 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "705", "755", "activeSafetyDsm", false, true); //1
        // 驾驶员未系安全带报警1级
        this.fillObject(rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "706", "756", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "707", "757", "activeSafetyDsm", false, true); //1
        // 驾驶员不在驾驶位报警1级
        this.fillObject(rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "708", "758", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "709", "759", "activeSafetyDsm", false, true); //1
        // 驾驶员双手脱离方向盘报警1级
        this.fillObject(rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "710", "760", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "711", "761", "activeSafetyDsm", false, true); //1
        // 喝水报警 1级
        this.fillObject(rootElement.lang.alarm_name_644 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "644", "694", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_644 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "645", "695", "activeSafetyDsm", false, true); //1
        // 驾驶员IC卡异常报警1级
        this.fillObject(rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "641", "691", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "642", "692", "activeSafetyDsm", false, true); //1
        // 驾驶员行为监测功能失效报警1级
        this.fillObject(rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "717", "767", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "718", "768", "activeSafetyDsm", false, true); //1
//		// 探头遮挡报警1级
        this.fillObject(rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "734", "784", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "735", "785", "activeSafetyDsm", false, true); //1
//		// 换人驾驶报警1级
        this.fillObject(rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "736", "786", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "737", "787", "activeSafetyDsm", false, true); //1
//		// 超时驾驶报警1级
        this.fillObject(rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "738", "788", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "739", "789", "activeSafetyDsm", false, true); //1
        //墨镜失效一级报警
        this.fillObject(rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "639", "689", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "640", "690", "activeSafetyDsm", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_745 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "745", "795", "activeSafetyDsm", false, true);
        this.fillObject(rootElement.lang.alarm_name_745 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "746", "796", "activeSafetyDsm", false, true);

        this.fillObject(rootElement.lang.alarm_name_845 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "845", "895", "activeSafetyDsm", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_845 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "846", "896", "activeSafetyDsm", false, true); //1
        // 湘标玩手机
        this.fillObject(rootElement.lang.alarm_name_525 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "525", "575", "activeSafetyDsm", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_525 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "541", "591", "activeSafetyDsm", false, true); //1

        //智能检测
        this.fillObject(rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_11111, rootElement.lang.znjc, "740", "790", "activeSafetyZnjc", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_22222, rootElement.lang.znjc, "741", "791", "activeSafetyZnjc", false, true);   //1
        this.fillObject(rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_11111, rootElement.lang.znjc, "742", "792", "activeSafetyZnjc", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_22222, rootElement.lang.znjc, "743", "793", "activeSafetyZnjc", false, true);   //1
        return;
    }

    //主动安全设备
    //后方接近报警
    if (alarmType === 3) {
        //ADAS类
        //低速前车碰撞预警1级
        this.fillObject(rootElement.lang.alarm_name_840 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "840", "890", "activeSafetyAdas", false, true); //1
        //低速前车碰撞预警 2级
        this.fillObject(rootElement.lang.alarm_name_840 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "841", "891", "activeSafetyAdas", false, true); //1
        //前向碰撞报警1级
        this.fillObject(rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "600", "650", "activeSafetyAdas", false, true);	//1
        //前向碰撞报警 2级
        this.fillObject(rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "601", "651", "activeSafetyAdas", false, true);	//1
        //车道偏离报警1级
        this.fillObject(rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "602", "652", "activeSafetyAdas", false, true);	//1
        //车道偏离报警 2级
        this.fillObject(rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "603", "653", "activeSafetyAdas", false, true);	//1
        //道路标识超限报警 2级
        this.fillObject(rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "610", "660", "activeSafetyAdas", false, true);	//1
        //道路标识超限报警 1级
        this.fillObject(rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "611", "661", "activeSafetyAdas", false, true);	//1
        //频繁变道  2级
        this.fillObject(rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "608", "658", "activeSafetyAdas", false, true);	//1
        //频繁变道  1级
        this.fillObject(rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "609", "659", "activeSafetyAdas", false, true);	//1
        //行人碰撞报警  2级
        this.fillObject(rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "606", "656", "activeSafetyAdas", false, true);	//1
        //行人碰撞报警  1级
        this.fillObject(rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "607", "657", "activeSafetyAdas", false, true);	//1
        //车距过近报警 2级
        this.fillObject(rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "604", "654", "activeSafetyAdas", false, true);	//1
        //车距过近报警 1级
        this.fillObject(rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "605", "655", "activeSafetyAdas", false, true);	//1
        //障碍物报警 2级
        this.fillObject(rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "612", "662", "activeSafetyAdas", false, true);	//1
        //障碍物报警 1级
        this.fillObject(rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "613", "663", "activeSafetyAdas", false, true);	//1
        //弯道车速预警1级
        this.fillObject(rootElement.lang.alarm_name_700 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "700", "750", "activeSafetyAdas", false, true);	//1
        //弯道车速预警2级
        this.fillObject(rootElement.lang.alarm_name_700 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "701", "751", "activeSafetyAdas", false, true);	//1
        //// 715    //驾驶辅助功能失效报警1级
        this.fillObject(rootElement.lang.alarm_name_715 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "715", "765", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_715 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "716", "766", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_728 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "728", "778", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_728 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "729", "779", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_730 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "730", "780", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_730 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "731", "781", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_732 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "732", "782", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_732 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "733", "783", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_542 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "542", "592", "activeSafetyAdas", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_542 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "543", "593", "activeSafetyAdas", false, true); //1
        if (!hideEvent) {
            //主动抓拍事件 2级
            this.fillObject(rootElement.lang.alarm_name_616 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "616", null, "activeSafetyAdas", false, true);	//1
            //主动抓拍事件 1级
            this.fillObject(rootElement.lang.alarm_name_616 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "617", null, "activeSafetyAdas", false, true);	//1
            //道路标志识别事件 2级
            this.fillObject(rootElement.lang.alarm_name_614 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "614", null, "activeSafetyAdas", false, true);	//1
            //道路标志识别事件 1级
            this.fillObject(rootElement.lang.alarm_name_614 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "615", null, "activeSafetyAdas", false, true);	//1
        }
        //DSM类
        //抽烟报警  2级
        this.fillObject(rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "622", "672", "activeSafetyDsm", false, true);	//1
        //抽烟报警  1级
        this.fillObject(rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "623", "673", "activeSafetyDsm", false, true);	//1
        //接打电话报警  2级
        this.fillObject(rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "620", "670", "activeSafetyDsm", false, true);	//1
        //接打电话报警  1级
        this.fillObject(rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "621", "671", "activeSafetyDsm", false, true);	//1
        //疲劳驾驶报警 2级
        this.fillObject(rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "618", "668", "activeSafetyDsm", false, true);	//1
        //疲劳驾驶报警 1级
        this.fillObject(rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "619", "669", "activeSafetyDsm", false, true);	//1
        //驾驶员异常报警  2级
        this.fillObject(rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "626", "676", "activeSafetyDsm", false, true);	//1
        //驾驶员异常报警  1级
        this.fillObject(rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "627", "677", "activeSafetyDsm", false, true);	//1
        //分神驾驶报警  2级
        this.fillObject(rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "624", "674", "activeSafetyDsm", false, true);	//1
        //分神驾驶报警  1级
        this.fillObject(rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "625", "675", "activeSafetyDsm", false, true);	//1
        //长时间不目视前方报警1级
        this.fillObject(rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "702", "752", "activeSafetyDsm", false, true);	//1
        //长时间不目视前方报警2级
        this.fillObject(rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "703", "753", "activeSafetyDsm", false, true);	//1
        //系统不能正常工作报警1级
        this.fillObject(rootElement.lang.alarm_name_704 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "704", "754", "activeSafetyDsm", false, true);	//1
        //系统不能正常工作报警2级
        this.fillObject(rootElement.lang.alarm_name_704 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "705", "755", "activeSafetyDsm", false, true);	//1
        //驾驶员未系安全带报警1级
        this.fillObject(rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "706", "756", "activeSafetyDsm", false, true);	//1
        //驾驶员未系安全带报警2级
        this.fillObject(rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "707", "757", "activeSafetyDsm", false, true);	//1
        //驾驶员不在驾驶位报警1级
        this.fillObject(rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "708", "758", "activeSafetyDsm", false, true);	//1
        //驾驶员不在驾驶位报警2级
        this.fillObject(rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "709", "759", "activeSafetyDsm", false, true);	//1
        //驾驶员双手脱离方向盘报警1级
        this.fillObject(rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "710", "760", "activeSafetyDsm", false, true);	//1
        //驾驶员双手脱离方向盘报警2级
        this.fillObject(rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "711", "761", "activeSafetyDsm", false, true);	//1
        ////喝水报警 1级
        this.fillObject(rootElement.lang.alarm_name_644 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "644", "694", "activeSafetyDsm", false, true);	//1
        ////喝水报警 2级
        this.fillObject(rootElement.lang.alarm_name_644 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "645", "695", "activeSafetyDsm", false, true);	//1
//		if(!enableSubiao()){
        //驾驶员IC卡异常报警1级
        this.fillObject(rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "641", "691", "activeSafetyDsm", false, true);	//1
        //驾驶员IC卡异常报警2级
        this.fillObject(rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "642", "692", "activeSafetyDsm", false, true);	//1
        //驾驶员身份识别事件
        /*  if (!hideEvent) {
              this.fillObject(rootElement.lang.alarm_name_643, rootElement.lang.abnormality, "643", null, "activeSafetyDsm", false, true);	//1
          }*/
//        }
        //// 717 //驾驶员行为监测功能失效报警1级
        this.fillObject(rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "717", "767", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "718", "768", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_719, rootElement.lang.abnormality, "719", null, "activeSafetyDsm", false, true);	//1
        // DSM(其他地方)
        this.fillObject(rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "734", "784", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "735", "785", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "736", "786", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "737", "787", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "738", "788", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "739", "789", "activeSafetyDsm", false, true);	//1
//		if(rootElement.myUserRole && rootElement.myUserRole.isIsSunglassFailure()){
        //墨镜失效一级报警
        this.fillObject(rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "639", "689", "activeSafetyDsm", false, true);	//1
        //墨镜失效2级报警
        this.fillObject(rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "640", "690", "activeSafetyDsm", false, true);	//1
//		}
        //单手脱离方向盘
        this.fillObject(rootElement.lang.alarm_name_745 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "745", "795", "activeSafetyDsm", false, true);
        this.fillObject(rootElement.lang.alarm_name_745 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "746", "796", "activeSafetyDsm", false, true);
        if (!hideEvent) {
            //驾驶员变更事件 2级
            this.fillObject(rootElement.lang.alarm_name_630 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "630", null, "activeSafetyDsm", false, true);	//1
            //驾驶员变更事件 1级
            this.fillObject(rootElement.lang.alarm_name_630 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "631", null, "activeSafetyDsm", false, true);	//1
            //自动抓拍事件 2级
            this.fillObject(rootElement.lang.alarm_name_628 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "628", null, "activeSafetyDsm", false, true);	//1
            //自动抓拍事件 1级
            this.fillObject(rootElement.lang.alarm_name_628 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "629", null, "activeSafetyDsm", false, true);	//1
        }
        if (!hideEvent) {
            this.fillObject(rootElement.lang.alarm_name_843, rootElement.lang.abnormality, "843", "", "activeSafetyDsm", false, true); //1
            this.fillObject(rootElement.lang.alarm_name_844, rootElement.lang.abnormality, "844", "", "activeSafetyDsm", false, true); //1
            this.fillObject(rootElement.lang.alarm_name_847, rootElement.lang.abnormality, "847", "", "activeSafetyDsm", false, true); //1
            this.fillObject(rootElement.lang.alarm_name_842, rootElement.lang.abnormality, "842", "", "activeSafetyDsm", false, true); //1
        }
        this.fillObject(rootElement.lang.alarm_name_845 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "845", "895", "activeSafetyDsm", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_845 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "846", "896", "activeSafetyDsm", false, true); //1
        if(rootElement.myUserRole && rootElement.myUserRole.isEpidemicSupport()){
            this.fillObject(rootElement.lang.alarm_name_1429, rootElement.lang.abnormality,"1429", "1479", "activeSafetyDsm", false, true); //1
        }

        //tmps 胎压
        //胎压报警
        this.fillObject(rootElement.lang.alarm_name_632, rootElement.lang.tmps, "632", "682", "activeSafetyTmps", false, true);	//1

        //BDS接近报警
        //后方接近报警
        this.fillObject(rootElement.lang.alarm_name_633, rootElement.lang.proximity, "633", "683", "activeSafetyProximity", false, true);	//1
        //左侧后方接近报警
        this.fillObject(rootElement.lang.alarm_name_634, rootElement.lang.proximity, "634", "684", "activeSafetyProximity", false, true);	//1
        //右侧后方接近报警
        this.fillObject(rootElement.lang.alarm_name_635, rootElement.lang.proximity, "635", "685", "activeSafetyProximity", false, true);	//1

        //激烈驾驶
        //激烈驾驶报警(川标)
        this.fillObject(rootElement.lang.alarm_name_720, rootElement.lang.fierce_driving_type, "720", "770", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_721, rootElement.lang.fierce_driving_type, "721", "771", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_722, rootElement.lang.fierce_driving_type, "722", "772", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_723, rootElement.lang.fierce_driving_type, "723", "773", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_724, rootElement.lang.fierce_driving_type, "724", "774", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_725, rootElement.lang.fierce_driving_type, "725", "775", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_726, rootElement.lang.fierce_driving_type, "726", "776", "activeSafetyFierce", false, true);	//1

        //智能检测
        this.fillObject(rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_11111, rootElement.lang.znjc, "740", "790", "activeSafetyZnjc", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_22222, rootElement.lang.znjc, "741", "791", "activeSafetyZnjc", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_11111, rootElement.lang.znjc, "742", "792", "activeSafetyZnjc", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_22222, rootElement.lang.znjc, "743", "793", "activeSafetyZnjc", false, true);	//1


        //卫星定位报警(川标)
        this.fillObject(rootElement.lang.alarm_name_727, rootElement.lang.satellite_positioning_type, "727", "777", "activeSafetySatellite", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_744, rootElement.lang.satellite_positioning_type, "744", "794", "activeSafetySatellite", false, true);	//1

        // 黑龙江定制
        this.addHeiLongJiangAlarm();
        // 湖南（湘标）
        this.addHuNanAlarm();
        // 渣土车主动安全
        this.addMuckAlarm();
        // 北京主动安全
        this.addBeiJingAlarm();
        // 酒测
        this.addWineTestAlarm();
        // 四川
        this.addSiChuanAlarm();
        return;
    }
    // 
    if (alarmType == 'wisdomScreenAlarm') {
        this.fillObject(rootElement.lang.monitor_alarm_speed, rootElement.lang.over_speed_or_tired, "11", "61", "speendAlarm", false, true);    //1
        this.fillObject(rootElement.lang.alarm_type_fatigue, rootElement.lang.over_speed_or_tired, "49", "99", "speendAlarm", false, true);
        //超速预警
        this.fillObject(rootElement.lang.alarm_name_428, rootElement.lang.over_speed_or_tired, "428", "478", "speendAlarm", false, true);
        // 凌晨营运
        this.fillObject(rootElement.lang.alarm_type_nightdriving, rootElement.lang.monitor_alarm_platform, "151", "152", "platformAlarm", false, true);
        // 离线位移 136
        this.fillObject(rootElement.lang.report_abnormalPosition_platform, rootElement.lang.monitor_alarm_platform, "136", "", "platformAlarm", false, true);   //1
        //ADAS类
        //低速前车碰撞预警1级
        //前向碰撞报警1级
        this.fillObject(rootElement.lang.alarm_name_600, rootElement.lang.safetyAdas, "600-601", "650", "activeSafetyAdas", false, true);	//1
        //车道偏离报警1级
        this.fillObject(rootElement.lang.alarm_name_602, rootElement.lang.safetyAdas, "602-603", "652", "activeSafetyAdas", false, true);	//1
        //道路标识超限报警 2级
        this.fillObject(rootElement.lang.alarm_name_610, rootElement.lang.safetyAdas, "610-611", "660", "activeSafetyAdas", false, true);	//1
        //频繁变道  1级
        this.fillObject(rootElement.lang.alarm_name_608, rootElement.lang.safetyAdas, "608-609", "658", "activeSafetyAdas", false, true);	//1
        //行人碰撞报警  1级
        this.fillObject(rootElement.lang.alarm_name_606, rootElement.lang.safetyAdas, "606-607", "656", "activeSafetyAdas", false, true);	//1
        //车距过近报警 1级
        this.fillObject(rootElement.lang.alarm_name_604, rootElement.lang.safetyAdas, "604-605", "654", "activeSafetyAdas", false, true);	//1
        //障碍物报警 1级
        this.fillObject(rootElement.lang.alarm_name_612, rootElement.lang.safetyAdas, "612-613", "662", "activeSafetyAdas", false, true);	//1
        //弯道车速预警1级
        this.fillObject(rootElement.lang.alarm_name_700, rootElement.lang.safetyAdas, "700-701", "750", "activeSafetyAdas", false, true);	//1
        //// 715    //驾驶辅助功能失效报警1级
        this.fillObject(rootElement.lang.alarm_name_715, rootElement.lang.safetyAdas, "715-716", "765", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_728, rootElement.lang.safetyAdas, "728-729", "778", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_730, rootElement.lang.safetyAdas, "730-731", "780", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_732, rootElement.lang.safetyAdas, "732-733", "782", "activeSafetyAdas", false, true);	//1
        //DSM类
        //抽烟报警  1级
        this.fillObject(rootElement.lang.alarm_name_622, rootElement.lang.abnormality, "622-623", "672", "activeSafetyDsm", false, true);	//1
        //接打电话报警  1级
        this.fillObject(rootElement.lang.alarm_name_620, rootElement.lang.abnormality, "620-621", "670", "activeSafetyDsm", false, true);	//1
        //疲劳驾驶报警 1级
        this.fillObject(rootElement.lang.alarm_name_618, rootElement.lang.abnormality, "618-619", "668", "activeSafetyDsm", false, true);	//1
        //驾驶员异常报警  1级
        this.fillObject(rootElement.lang.alarm_name_626, rootElement.lang.abnormality, "626-627", "676", "activeSafetyDsm", false, true);	//1
        //分神驾驶报警  1级
        this.fillObject(rootElement.lang.alarm_name_624, rootElement.lang.abnormality, "624-625", "674", "activeSafetyDsm", false, true);	//1
        //长时间不目视前方报警1级
        this.fillObject(rootElement.lang.alarm_name_702, rootElement.lang.abnormality, "702-703", "752", "activeSafetyDsm", false, true);	//1
        //系统不能正常工作报警1级
        this.fillObject(rootElement.lang.alarm_name_704, rootElement.lang.abnormality, "704-705", "754", "activeSafetyDsm", false, true);	//1
        //驾驶员未系安全带报警1级
        this.fillObject(rootElement.lang.alarm_name_706, rootElement.lang.abnormality, "706-707", "756", "activeSafetyDsm", false, true);	//1
        //驾驶员不在驾驶位报警1级
        this.fillObject(rootElement.lang.alarm_name_708, rootElement.lang.abnormality, "708-709", "758", "activeSafetyDsm", false, true);	//1
        //驾驶员双手脱离方向盘报警1级
        this.fillObject(rootElement.lang.alarm_name_710, rootElement.lang.abnormality, "710-711", "760", "activeSafetyDsm", false, true);	//1
        ////喝水报警 1级
        this.fillObject(rootElement.lang.alarm_name_644, rootElement.lang.abnormality, "644-645", "694", "activeSafetyDsm", false, true);	//1
        //驾驶员IC卡异常报警1级
        this.fillObject(rootElement.lang.alarm_name_641, rootElement.lang.abnormality, "641-642", "691", "activeSafetyDsm", false, true);	//1
        //// 717 //驾驶员行为监测功能失效报警1级
        this.fillObject(rootElement.lang.alarm_name_717, rootElement.lang.abnormality, "717-718", "767", "activeSafetyDsm", false, true);	//1
        // DSM(其他地方)
        this.fillObject(rootElement.lang.alarm_name_734, rootElement.lang.abnormality, "734-735", "784", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_736, rootElement.lang.abnormality, "736-737", "786", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_738, rootElement.lang.abnormality, "738-739", "788", "activeSafetyDsm", false, true);	//1
        //墨镜失效一级报警
        this.fillObject(rootElement.lang.alarm_name_639, rootElement.lang.abnormality, "639-640", "689", "activeSafetyDsm", false, true);	//1
        //单手脱离方向盘
        this.fillObject(rootElement.lang.alarm_name_745, rootElement.lang.abnormality, "745-746", "795", "activeSafetyDsm", false, true);
        this.fillObject(rootElement.lang.alarm_name_845, rootElement.lang.abnormality, "845-846", "895", "activeSafetyDsm", false, true); //1
        //驾驶员变更事件
        this.fillObject(rootElement.lang.alarm_name_630, rootElement.lang.abnormality, "630-631", null, "activeSafetyDsm", false, true); //1
        /*****其他报警*****/
        //超时停车报警
        this.fillObject(rootElement.lang.alarm_type_overtimeParking, rootElement.lang.monitor_alarm_otherAlarm, "14", null, "otherAlarm", false, true); //1
        //当天累计驾驶超时
        this.fillObject(rootElement.lang.alarm_name_210, rootElement.lang.monitor_alarm_otherAlarm, "210", null, "otherAlarm", false, true); //1
        /*****故障报警*****/
        //摄像头故障
        this.fillObject(rootElement.lang.alarm_name_209, rootElement.lang.monitor_alarm_fault, "209", null, "faultAlarm", false, true); //1
        //tmps 胎压
        //胎压报警
        this.fillObject(rootElement.lang.alarm_name_632, rootElement.lang.tmps, "632", "682", "activeSafetyTmps", false, true);	//1
        this.fillObject(rootElement.lang.tpms1, rootElement.lang.tmps, "6321", null, "activeSafetyTmps", false, true);	//1
        this.fillObject(rootElement.lang.tpms2, rootElement.lang.tmps, "6322", null, "activeSafetyTmps", false, true);	//1
        this.fillObject(rootElement.lang.tpms3, rootElement.lang.tmps, "6323", null, "activeSafetyTmps", false, true);	//1
        //BDS接近报警
        //后方接近报警
        this.fillObject(rootElement.lang.alarm_name_633, rootElement.lang.proximity, "633", "683", "activeSafetyProximity", false, true);	//1
        //左侧后方接近报警
        this.fillObject(rootElement.lang.alarm_name_634, rootElement.lang.proximity, "634", "684", "activeSafetyProximity", false, true);	//1
        //右侧后方接近报警
        this.fillObject(rootElement.lang.alarm_name_635, rootElement.lang.proximity, "635", "685", "activeSafetyProximity", false, true);	//1
        //激烈驾驶
        //激烈驾驶报警(川标)
        this.fillObject(rootElement.lang.alarm_name_720, rootElement.lang.fierce_driving_type, "720", "770", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_721, rootElement.lang.fierce_driving_type, "721", "771", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_722, rootElement.lang.fierce_driving_type, "722", "772", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_723, rootElement.lang.fierce_driving_type, "723", "773", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_724, rootElement.lang.fierce_driving_type, "724", "774", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_725, rootElement.lang.fierce_driving_type, "725", "775", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_726, rootElement.lang.fierce_driving_type, "726", "776", "activeSafetyFierce", false, true);	//1
        //智能检测
        this.fillObject(rootElement.lang.alarm_name_740, rootElement.lang.znjc, "740-741", "790", "activeSafetyZnjc", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_742, rootElement.lang.znjc, "742-743", "792", "activeSafetyZnjc", false, true);	//1
        //卫星定位报警(川标)
        this.fillObject(rootElement.lang.alarm_name_727, rootElement.lang.satellite_positioning_type, "727", "777", "activeSafetySatellite", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_744, rootElement.lang.satellite_positioning_type, "744", "794", "activeSafetySatellite", false, true);	//1
        // 黑龙江定制
        //this.addHeiLongJiangAlarm();
        return;
    }
    if (alarmType === 2) {//用于统计 日报表报警对应的数据

        //超速报警         11
        this.fillObject(rootElement.lang.monitor_alarm_speed, rootElement.lang.over_speed_or_tired, "11", "61", "speendAlarm", false, true);    //1
        //自定义报警     	1
        this.fillObject(rootElement.lang.alarm_type_custom_alarm, rootElement.lang.monitor_alarm_otherAlarm, "1", "", "otherAlarm", false, true);	//1
        //紧急按钮报警		2
        this.fillObject(rootElement.lang.alarm_type_ungency_button, rootElement.lang.monitor_alarm_operate, "2", "52", "operateAlarm", true, true);
        //区域超速报警		200
        this.fillObject(rootElement.lang.alarm_type_regionalSpeedingAlarm, rootElement.lang.monitor_alarm_fence, "200", "250", "fenceAlarm", false, true);	//1
        //危险驾驶行为报警				201
        this.fillObject(rootElement.lang.alarm_type_earlyWarning, rootElement.lang.monitor_alarm_otherAlarm, "201", "251", "otherAlarm", false, true);	//1
        //GNSS模块发生故障报警		202
        this.fillObject(rootElement.lang.alarm_type_GNSSModuleFailure, rootElement.lang.monitor_alarm_fault, "202", "252", "faultAlarm", false, true);	//1
        //GNSS天线未接或者剪断 203
        this.fillObject(rootElement.lang.alarm_type_GNSSAntennaMissedOrCut, rootElement.lang.monitor_alarm_fault, "203", "253", "faultAlarm", false, true);	//1
        //GNSS天线短路		204
        this.fillObject(rootElement.lang.alarm_type_GNSSAntennaShort, rootElement.lang.monitor_alarm_fault, "204", "254", "faultAlarm", false, true);	//1
        //电源欠压			205
        this.fillObject(rootElement.lang.alarm_type_mainSupplyUndervoltage, rootElement.lang.monitor_alarm_otherAlarm, "205", "255", "otherAlarm", false, true);	//1
        //电源掉电			206
        this.fillObject(rootElement.lang.alarm_type_mainPowerFailure, rootElement.lang.monitor_alarm_otherAlarm, "206", "256", "otherAlarm", false, true);	//1
        //终端LCD或者显示器故障	207
        if (rootElement.myUserRole && !rootElement.myUserRole.isShieldReport()) {
            this.fillObject(rootElement.lang.alarm_type_LCDorDisplayFailure, rootElement.lang.monitor_alarm_fault, "207", "257", "faultAlarm", false, true);	//1
        }
        //TTS模块故障		208
        this.fillObject(rootElement.lang.alarm_type_TTSModuleFailure, rootElement.lang.monitor_alarm_fault, "208", "258", "faultAlarm", false, true);	//1
        //摄像头故障		209
        this.fillObject(rootElement.lang.alarm_type_cameraMalfunction, rootElement.lang.monitor_alarm_fault, "209", "259", "faultAlarm", false, true);	//1
        //累计驾驶超时		210
        this.fillObject(rootElement.lang.alarm_type_cumulativeDayDrivingTimeout, rootElement.lang.monitor_alarm_otherAlarm, "210", "260", "otherAlarm", false, true);	//1
        //停车过长报警		14
        this.fillObject(rootElement.lang.alarm_type_overtimeParking, rootElement.lang.monitor_alarm_otherAlarm, "14", "64", "otherAlarm", false, true);	//1
        //进出区域			211
        this.fillObject(rootElement.lang.alarm_type_outOfRegional, rootElement.lang.monitor_alarm_fence, "211", "261", "fenceAlarm", true, true);	//1
        //进出路线报警			212
        this.fillObject(rootElement.lang.alarm_type_outOfLine, rootElement.lang.monitor_alarm_fence, "212", "262", "fenceAlarm", false, true);	//1
        //路段行驶时间过长/过短	213
        this.fillObject(rootElement.lang.alarm_type_InadequateOrTooLongRoadTravelTime, rootElement.lang.monitor_alarm_fence, "213", "263", "fenceAlarm", false, true);	//1
        //路线偏离报警			214
        this.fillObject(rootElement.lang.alarm_type_routeDeviation, rootElement.lang.monitor_alarm_fence, "214", "264", "fenceAlarm", false, true);	//1
        //车辆VSS故障			215
        this.fillObject(rootElement.lang.alarm_type_VSSFailure, rootElement.lang.monitor_alarm_fault, "215", "265", "faultAlarm", false, true);	//1
        //车辆油量异常报警			216
        this.fillObject(rootElement.lang.alarm_type_abnormalFuel, rootElement.lang.monitor_alarm_fuel, "216", "266", "fuelAlarm", false, true);	//1
        if (rootElement.myUserRole && !rootElement.myUserRole.isShieldReport()) {
            //车辆被盗报警			217
            this.fillObject(rootElement.lang.alarm_type_antitheftDevice, rootElement.lang.monitor_alarm_otherAlarm, "217", "267", "otherAlarm", false, true);	//1
            //车辆非法点火报警		8
            this.fillObject(rootElement.lang.alarm_type_illegalIgnition, rootElement.lang.monitor_alarm_otherAlarm, "8", "58", "otherAlarm", false, true);	//1
            //車輛非法位移報警			218
            this.fillObject(rootElement.lang.alarm_type_illegalDisplacement, rootElement.lang.monitor_alarm_otherAlarm, "218", "268", "otherAlarm", false, true);	//1
        }
        //碰撞侧翻报警		219
        this.fillObject(rootElement.lang.alarm_type_rollover, rootElement.lang.alarm_GSensor_type, "219", "269", "gSensor", false, true);	//1
        //夜间行驶报警		151
        this.fillObject(rootElement.lang.alarm_type_nightdriving, rootElement.lang.monitor_alarm_platform, "151", "152", "platformAlarm", false, true);	//1
        //超速报警			11
        this.fillObject(rootElement.lang.monitor_alarm_speed, rootElement.lang.over_speed_or_tired, "11", "61", "speendAlarm", false, true);	//1
        //非法开门报警		6
        this.fillObject(rootElement.lang.alarm_type_door_open_lawless, rootElement.lang.monitor_alarm_operate, "6", "56", "operateAlarm", false, true);	//1
        //区域超速报警(平台产生) 	300
        this.fillObject(rootElement.lang.alarm_type_areaOverSpeed_platform, rootElement.lang.monitor_alarm_platform, "300", "350", "platformAlarm", false, true);	//1
        //区域低速报警(平台产生) 	301
        this.fillObject(rootElement.lang.alarm_type_areaLowSpeed_platform, rootElement.lang.monitor_alarm_platform, "301", "351", "platformAlarm", false, true);	//1
        //进出入区域(平台产生)	 	302
        this.fillObject(rootElement.lang.alarm_type_areaInOut_platform, rootElement.lang.monitor_alarm_platform, "302", "352", "platformAlarm", true, true);	//1
        //线路偏移(平台产生)	 	303
        this.fillObject(rootElement.lang.alarm_type_lineInOut_platform, rootElement.lang.monitor_alarm_platform, "303", "353", "platformAlarm", false, true);	//1
        //时间段超速报警(平台产生)	304
        this.fillObject(rootElement.lang.alarm_type_overSpeed_platform, rootElement.lang.monitor_alarm_platform, "304", "354", "platformAlarm", false, true);	//1
        //时间段低速报警(平台产生) 	305
        this.fillObject(rootElement.lang.alarm_type_lowSpeed_platform, rootElement.lang.monitor_alarm_platform, "305", "355", "platformAlarm", false, true);	//1
        //疲劳驾驶(平台产生)  	 	306
        this.fillObject(rootElement.lang.alarm_name_306_default, rootElement.lang.monitor_alarm_platform, "306", "356", "platformAlarm", false, true);	//1
        //超时停车(平台产生)		307
        this.fillObject(rootElement.lang.alarm_type_parkTooLong_platform, rootElement.lang.monitor_alarm_platform, "307", "357", "platformAlarm", false, true);	//1
        //关键点监控报警(平台产生)	308
        this.fillObject(rootElement.lang.alarm_type_areaPoint_platform, rootElement.lang.monitor_alarm_platform, "308", "358", "platformAlarm", false, true);	//1
        //线路超速报警(平台产生) 	309
        this.fillObject(rootElement.lang.alarm_type_lineOverSpeed_platform, rootElement.lang.monitor_alarm_platform, "309", "359", "platformAlarm", false, true);	//1
        //线路低速报警(平台产生) 	310
        this.fillObject(rootElement.lang.alarm_type_lineLowSpeed_platform, rootElement.lang.monitor_alarm_platform, "310", "360", "platformAlarm", false, true);	//1
        //道路等级超速报警(平台产生) 311
        this.fillObject(rootElement.lang.report_roadLvlOverSpeed_platform, rootElement.lang.monitor_alarm_platform, "311", "361", "platformAlarm", false, true);	//1
        //疲劳驾驶					49
        this.fillObject(rootElement.lang.alarm_type_fatigue, rootElement.lang.over_speed_or_tired, "49", "99", "speendAlarm", false, true);	//1
        //面部疲劳     				249
        this.fillObject(rootElement.lang.face_fatigue, rootElement.lang.monitor_alarm_adas, "249", "299", "adasAlarm", false, true);	//1
        //夜间超速(平台产生)  		314
        this.fillObject(rootElement.lang.alarm_type_night_overSpeed_platform, rootElement.lang.monitor_alarm_platform, "314", "364", "platformAlarm", false, true);	//1

        // 2018-07-23 添加 主要修改警情统计报表 下拉选择
        // 定位异常 136 countStr40
        this.fillObject(rootElement.lang.report_abnormalPosition_platform, rootElement.lang.monitor_alarm_platform, "136", "", "platformAlarm", false, true);	//1
        if (rootElement.myUserRole && !rootElement.myUserRole.isShieldReport()) {
            // 设备开锁 182 countStr41
            this.fillObject(rootElement.lang.alarm_type_device_unlock, rootElement.lang.monitor_alarm_otherAlarm, "182", "232", "otherAlarm", false, false);	//1
            // 设备上锁 183 countStr42
            this.fillObject(rootElement.lang.alarm_type_device_lock, rootElement.lang.monitor_alarm_otherAlarm, "183", "233", "otherAlarm", false, false);	//1
            // 氧气浓度低 192 countStr43
            this.fillObject(rootElement.lang.alarm_type_lowOxygen, rootElement.lang.monitor_alarm_otherAlarm, "192", "193", "otherAlarm", false, true);	//1
            // 其他视频设备故障报警 244 countStr44
            this.fillObject(rootElement.lang.other_device_error, rootElement.lang.monitor_alarm_otherAlarm, "244", "294", "otherAlarm", false, true);	//其他视频设备故障报警
            // 特殊报警录像达到存储阈值报警 245 countStr45
            this.fillObject(rootElement.lang.record_threshold, rootElement.lang.monitor_alarm_otherAlarm, "245", "295", "otherAlarm", false, true);	//特殊报警录像达到存储阈值报警
            // 烟感报警 194 countStr46
            this.fillObject(rootElement.lang.smoke_induction_alarm, rootElement.lang.monitor_alarm_otherAlarm, "194", "195", "otherAlarm", false, true);  //烟感报警
            // 异常驾驶 248 countStr47
            this.fillObject(rootElement.lang.abnormal_drive, rootElement.lang.monitor_alarm_otherAlarm, "248", "298", "otherAlarm", false, true);  //异常驾驶
        }
        //TODO 警情统计
        this.fillObject(rootElement.lang.over_speed_warning, rootElement.lang.over_speed_or_tired, "428", "478", "speendAlarm", false, true);	//1
        this.fillObject(rootElement.lang.module_failure, rootElement.lang.monitor_alarm_fault, "712", "762", "faultAlarm", false, true);	//1
        //疲劳驾驶预警
        this.fillObject(rootElement.lang.fatigue_warning, rootElement.lang.over_speed_or_tired, "429", "479", "speendAlarm", false, true);
        //前撞预警
        this.fillObject(rootElement.lang.forward_collosion_warning, rootElement.lang.monitor_alarm_adas, "430", "480", "adasAlarm", false, true);
        //车道偏移预警
        this.fillObject(rootElement.lang.lane_offset_warning, rootElement.lang.monitor_alarm_adas, "431", "481", "adasAlarm", false, true);
        //胎压预警
        this.fillObject(rootElement.lang.tire_warning, rootElement.lang.monitor_alarm_adas, "432", "482", "adasAlarm", false, true);
        //侧翻预警
        this.fillObject(rootElement.lang.rollover_warning, rootElement.lang.monitor_alarm_adas, "433", "483", "adasAlarm", false, true);
        //违规行驶
        this.fillObject(rootElement.lang.driving_violations, rootElement.lang.monitor_alarm_adas, "713", "763", "adasAlarm", false, true);
        //右转盲区异常报警
        this.fillObject(rootElement.lang.turn_blind_zone, rootElement.lang.monitor_alarm_adas, "714", "764", "adasAlarm", false, true);
        //ACC信号异常报警(平台)
        this.fillObject(rootElement.lang.acc_signal_abnormal, rootElement.lang.monitor_alarm_platform, "326", "376", "platformAlarm", false, true);	//1
        //位置信息异常报警(平台)
        this.fillObject(rootElement.lang.position_abnormal_alarm, rootElement.lang.monitor_alarm_platform, "327", "377", "platformAlarm", false, true);	//1
        //车辆长时异常离线提醒(平台)
        this.fillObject(rootElement.lang.offline_abnormal_alarm, rootElement.lang.monitor_alarm_platform, "328", "378", "platformAlarm", false, true);	//1
        return;
    }

    //渣土车查询页面得到报警信息
    if (alarmType === 1) {
        if (rootElement.myUserRole && !rootElement.myUserRole.isShieldReport()) {
            this.fillObject(rootElement.lang.alarm_name_231, rootElement.lang.monitor_alarm_otherAlarm, "231", "281", "otherAlarm", false, true);	//超员
        }
        this.fillObject(rootElement.lang.illegal_area_unload, rootElement.lang.monitor_alarm_otherAlarm, "138", "", "otherAlarm", false, true);//违规卸载
        this.fillObject(rootElement.lang.unclosed_cover, rootElement.lang.monitor_alarm_otherAlarm, "139", "", "otherAlarm", false, true);	//重车行驶厢盖未关闭
        this.fillObject(rootElement.lang.unproven_driving, rootElement.lang.monitor_alarm_otherAlarm, "411", "", "otherAlarm", false, true);//未插卡  驾驶员身份验证或未进行身份证验证启动车辆
    }

    //速度报警
    this.fillObject(rootElement.lang.monitor_alarm_speed, rootElement.lang.over_speed_or_tired, "11", "61", "speendAlarm", false, true);	//1
    this.fillObject(rootElement.lang.over_speed_warning, rootElement.lang.over_speed_or_tired, "428", "478", "speendAlarm", false, true);	//1

    //视频报警
    this.fillObject(rootElement.lang.alarm_type_motion, rootElement.lang.monitor_alarm_video, "15", "65", "videoAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_video_lost, rootElement.lang.monitor_alarm_video, "4", "54", "videoAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_video_mask, rootElement.lang.monitor_alarm_video, "5", "55", "videoAlarm", false, true);	//1
    //硬盘报警
    this.fillObject(rootElement.lang.monitor_alarm_disk1NoExist, rootElement.lang.monitor_alarm_disk, "39", null, "diskAlarm", false, false);	//1
    this.fillObject(rootElement.lang.monitor_alarm_disk2NoExist, rootElement.lang.monitor_alarm_disk, "40", null, "diskAlarm", false, false);	//1
    this.fillObject(rootElement.lang.alarm_type_disk_error, rootElement.lang.monitor_alarm_disk, "10", "60", "diskAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_memory_cell_fault, rootElement.lang.monitor_alarm_disk, "335", "385", "diskAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_highTemperature, rootElement.lang.monitor_alarm_disk, "157", "158", "diskAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_defect_disk, rootElement.lang.monitor_alarm_disk, "162", "163", "diskAlarm", false, true);	//1
    //故障报警
    this.fillObject(rootElement.lang.monitor_alarm_GpsInvalid, rootElement.lang.monitor_alarm_fault, "45", "85", "faultAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_gps_signal_loss, rootElement.lang.monitor_alarm_fault, "18", "68", "faultAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_GNSSModuleFailure, rootElement.lang.monitor_alarm_fault, "202", "252", "faultAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_GNSSAntennaMissedOrCut, rootElement.lang.monitor_alarm_fault, "203", "253", "faultAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_GNSSAntennaShort, rootElement.lang.monitor_alarm_fault, "204", "254", "faultAlarm", false, true);	//1
    if (rootElement.myUserRole && !rootElement.myUserRole.isShieldReport()) {
        this.fillObject(rootElement.lang.alarm_type_LCDorDisplayFailure, rootElement.lang.monitor_alarm_fault, "207", "257", "faultAlarm", false, true);	//1
    }
    this.fillObject(rootElement.lang.alarm_type_TTSModuleFailure, rootElement.lang.monitor_alarm_fault, "208", "258", "faultAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_cameraMalfunction, rootElement.lang.monitor_alarm_fault, "209", "259", "faultAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_VSSFailure, rootElement.lang.monitor_alarm_fault, "215", "265", "faultAlarm", false, true);	//1
    this.fillObject(rootElement.lang.module_failure, rootElement.lang.monitor_alarm_fault, "712", "762", "faultAlarm", false, true);	//1


    //出租车相关故障报警
    //探测报警
    this.fillObject(rootElement.lang.alarm_name_815, rootElement.lang.vehicle_Taxi, "815", "865", "taxiAlarm", false, true);	//1
    //未戴口罩报警
    this.fillObject(rootElement.lang.alarm_name_816, rootElement.lang.vehicle_Taxi, "816", "866", "taxiAlarm", false, true);	//1
    //有客不打表营运报警
    this.fillObject(rootElement.lang.alarm_name_848, rootElement.lang.vehicle_Taxi, "848", "898", "taxiAlarm", false, true);	//1
    //无客打表报警
    this.fillObject(rootElement.lang.alarm_name_849, rootElement.lang.vehicle_Taxi, "849", "899", "taxiAlarm", false, true);	//1
    //计程计价装置故障
    this.fillObject(rootElement.lang.taxi_alarm_valuation, rootElement.lang.vehicle_Taxi, "800", "850", "taxiAlarm", false, true);	//1
    //服务评价器故障（前后排）
    this.fillObject(rootElement.lang.taxi_alarm_evaluator, rootElement.lang.vehicle_Taxi, "801", "851", "taxiAlarm", false, true);	//1
    //LED 广告屏故障
    this.fillObject(rootElement.lang.taxi_alarm_led, rootElement.lang.vehicle_Taxi, "802", "852", "taxiAlarm", false, true);	//1
    //液晶（LCD）显示屏故障
    this.fillObject(rootElement.lang.taxi_alarm_lcd, rootElement.lang.vehicle_Taxi, "803", "853", "taxiAlarm", false, true);	//1
    //安全访问模块故障
    this.fillObject(rootElement.lang.taxi_alarm_secure, rootElement.lang.vehicle_Taxi, "804", "854", "taxiAlarm", false, true);	//1
    //巡游车顶灯故障
    this.fillObject(rootElement.lang.taxi_alarm_roof_light, rootElement.lang.vehicle_Taxi, "805", "855", "taxiAlarm", false, true);	//1
    //连续驾驶超时
    this.fillObject(rootElement.lang.taxi_alarm_driving_timeout, rootElement.lang.vehicle_Taxi, "806", "856", "taxiAlarm", false, true);	//1
    //禁行路段行驶
    this.fillObject(rootElement.lang.taxi_alarm_forbidden_road, rootElement.lang.vehicle_Taxi, "807", "857", "taxiAlarm", false, true);	//1
    //LCD终端故障
    this.fillObject(rootElement.lang.taxi_alarm_lcd_error, rootElement.lang.vehicle_Taxi, "808", "858", "taxiAlarm", false, true);	//1
    //录音设备故障
    this.fillObject(rootElement.lang.taxi_alarm_recording, rootElement.lang.vehicle_Taxi, "809", "859", "taxiAlarm", false, true);	//1
    //计程计价装置实时时钟超过规定的误差范围
    this.fillObject(rootElement.lang.taxi_alarm_clock_error, rootElement.lang.vehicle_Taxi, "810", "860", "taxiAlarm", false, true);	//1
    //紧急报警按钮故障
    this.fillObject(rootElement.lang.taxi_alarm_emergency, rootElement.lang.vehicle_Taxi, "811", "861", "taxiAlarm", false, true);	//1
    //巡游车不打表营运 / 网约车巡游带客
    this.fillObject(rootElement.lang.taxi_alarm_violation, rootElement.lang.vehicle_Taxi, "812", "862", "taxiAlarm", false, true);	//1
    //出租车相关
    //驾驶员人脸识别不匹配报警
    this.fillObject(rootElement.lang.taxi_alarm_unrecognize, rootElement.lang.vehicle_Taxi, "813", "863", "taxiAlarm", false, true);	//1
    //营运数据上传事件
    this.fillObject(rootElement.lang.taxi_operational_data_upload_event, rootElement.lang.vehicle_Taxi, "814", "864", "taxiAlarm", false, true);	//1
    //体温异常报警
    this.fillObject(rootElement.lang.alarm_name_1002, rootElement.lang.vehicle_Taxi, "1002", null, "taxiAlarm", false, true);

    // 备用电池欠压报警
    this.fillObject(rootElement.lang.alarm_name_538, rootElement.lang.monitor_alarm_fault, "538", "588", "faultAlarm", false, true);	//1
    // 备用电池失效报警
    this.fillObject(rootElement.lang.alarm_name_539, rootElement.lang.monitor_alarm_fault, "539", "589", "faultAlarm", false, true);	//1
    // 备用存储器故障报警
    this.fillObject(rootElement.lang.alarm_name_540, rootElement.lang.monitor_alarm_fault, "540", "590", "faultAlarm", false, true);	//1
    //操作报警
    this.fillObject(rootElement.lang.alarm_type_ungency_button, rootElement.lang.monitor_alarm_operate, "2", "52", "operateAlarm", true, true);	//1
    this.fillObject(rootElement.lang.alarm_type_door_open_lawless, rootElement.lang.monitor_alarm_operate, "6", "56", "operateAlarm", false, true);	//1
    //油量报警
    this.fillObject(rootElement.lang.alarm_type_add_oil, rootElement.lang.monitor_alarm_fuel, "46", "86", "fuelAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_dec_oil, rootElement.lang.monitor_alarm_fuel, "47", "87", "fuelAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_abnormalFuel, rootElement.lang.monitor_alarm_fuel, "216", "266", "fuelAlarm", false, true);	//1
    //其它报警
    this.fillObject(rootElement.lang.alarm_type_temperator, rootElement.lang.monitor_alarm_otherAlarm, "9", "59", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_gathering, rootElement.lang.monitor_alarm_otherAlarm, "153", "154", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_upsCut, rootElement.lang.monitor_alarm_otherAlarm, "155", "156", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_before_board_opened, rootElement.lang.monitor_alarm_otherAlarm, "159", "160", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_sim_lost, rootElement.lang.monitor_alarm_otherAlarm, "166", "167", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_erong_pwd, rootElement.lang.monitor_alarm_otherAlarm, "7", "57", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_door_abnormal, rootElement.lang.monitor_alarm_otherAlarm, "13", "63", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_shake, rootElement.lang.monitor_alarm_otherAlarm, "3", "53", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_Acc, rootElement.lang.monitor_alarm_otherAlarm, "16", "66", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_earlyWarning, rootElement.lang.monitor_alarm_otherAlarm, "201", "251", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_mainSupplyUndervoltage, rootElement.lang.monitor_alarm_otherAlarm, "205", "255", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_mainPowerFailure, rootElement.lang.monitor_alarm_otherAlarm, "206", "256", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_cumulativeDayDrivingTimeout, rootElement.lang.monitor_alarm_otherAlarm, "210", "260", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_overtimeParking, rootElement.lang.monitor_alarm_otherAlarm, "14", "64", "otherAlarm", false, true);	//1
    if (rootElement.myUserRole && !rootElement.myUserRole.isShieldReport()) {
        this.fillObject(rootElement.lang.alarm_type_lowOxygen, rootElement.lang.monitor_alarm_otherAlarm, "192", "193", "otherAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_type_antitheftDevice, rootElement.lang.monitor_alarm_otherAlarm, "217", "267", "otherAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_type_illegalIgnition, rootElement.lang.monitor_alarm_otherAlarm, "8", "58", "otherAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_type_illegalDisplacement, rootElement.lang.monitor_alarm_otherAlarm, "218", "268", "otherAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_type_device_unlock, rootElement.lang.monitor_alarm_otherAlarm, "182", null, "otherAlarm", false, false);	//1
        this.fillObject(rootElement.lang.alarm_type_device_lock, rootElement.lang.monitor_alarm_otherAlarm, "183", null, "otherAlarm", false, false);	//1
    }

    this.fillObject(rootElement.lang.alarm_type_add_water, rootElement.lang.monitor_alarm_otherAlarm, "184", null, "otherAlarm", false, false);	//1
    this.fillObject(rootElement.lang.alarm_type_dec_water, rootElement.lang.monitor_alarm_otherAlarm, "185", null, "otherAlarm", false, false);	//1
    this.fillObject(rootElement.lang.net_alarm_type_tpms, rootElement.lang.monitor_alarm_otherAlarm, "239", null, "otherAlarm", false, false);	//1
    this.fillObject(rootElement.lang.net_alarm_type_tt_abnormal, rootElement.lang.monitor_alarm_otherAlarm, "235", "285", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.net_alarm_type_tc_abnormal, rootElement.lang.monitor_alarm_otherAlarm, "236", "286", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.net_alarm_type_ts_nosignal, rootElement.lang.monitor_alarm_otherAlarm, "237", "287", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.net_alarm_type_ts_lowvoltage, rootElement.lang.monitor_alarm_otherAlarm, "238", "288", "otherAlarm", false, true);	//1
    //  占时只有监控报警详情查看
    this.fillObject(rootElement.lang.dangerous_driver_alarm, rootElement.lang.monitor_alarm_otherAlarm, "445", "495", "otherAlarm", false, true);	//1

    //2017年4月26日 10:52:34新增
    if (rootElement.myUserRole && !rootElement.myUserRole.isShieldReport()) {
        this.fillObject(rootElement.lang.other_device_error, rootElement.lang.monitor_alarm_otherAlarm, "244", "294", "otherAlarm", false, true);	//其他视频设备故障报警
        this.fillObject(rootElement.lang.record_threshold, rootElement.lang.monitor_alarm_otherAlarm, "245", "295", "otherAlarm", false, true);	//特殊报警录像达到存储阈值报警
        this.fillObject(rootElement.lang.smoke_induction_alarm, rootElement.lang.monitor_alarm_otherAlarm, "194", "195", "otherAlarm", false, true);  //烟感报警
        this.fillObject(rootElement.lang.abnormal_drive, rootElement.lang.monitor_alarm_otherAlarm, "248", "298", "otherAlarm", false, true);  //异常驾驶
    }


    this.fillObject(rootElement.lang.on_the_way_offline, rootElement.lang.monitor_alarm_otherAlarm, "146", null, "otherAlarm", false, true);  //烟感报警
    this.fillObject(rootElement.lang.unknow_vehicle, rootElement.lang.monitor_alarm_otherAlarm, "147", null, "otherAlarm", false, true);  //异常驾驶
    if (rootElement.myUserRole && !rootElement.myUserRole.isShieldReport()) {
        this.fillObject(rootElement.lang.alarm_name_231, rootElement.lang.monitor_alarm_otherAlarm, "231", "281", "otherAlarm", false, true);  //超员
    }
    this.fillObject(rootElement.lang.people_flow, rootElement.lang.monitor_alarm_otherAlarm, "135", null, "otherAlarm", false, true);  //808客流统计
    //司机刷卡     				442
    this.fillObject(rootElement.lang.driver_swipe, rootElement.lang.monitor_alarm_otherAlarm, "442", "", "otherAlarm", false, true);	//1
    //驾驶员信息采集上报  116
    this.fillObject(rootElement.lang.alarm_driver_info, rootElement.lang.monitor_alarm_otherAlarm, "116", "", "otherAlarm", false, true);	//1
    //FTP任务文件发生变化  143
   // this.fillObject(rootElement.lang.alarm_name_143, rootElement.lang.monitor_alarm_otherAlarm, "143", "", "otherAlarm", false, true);	//1
    //学生刷卡		443
    this.fillObject(rootElement.lang.student_swipe, rootElement.lang.monitor_alarm_otherAlarm, "443", "", "otherAlarm", false, true);	//1

    // 疲劳84220报警		125
    this.fillObject(rootElement.lang.fatigue84220_alarm, rootElement.lang.monitor_alarm_otherAlarm, "125", "", "otherAlarm", false, true);	//1
    // 正转
    this.fillObject(rootElement.lang.alarm_name_1000, rootElement.lang.monitor_alarm_otherAlarm, "1000", "1050", "otherAlarm", false, true);
    // 反转
    this.fillObject(rootElement.lang.alarm_name_1001, rootElement.lang.monitor_alarm_otherAlarm, "1001", "1051", "otherAlarm", false, true);
    // 超员提醒
    this.fillObject(rootElement.lang.alarm_name_148, rootElement.lang.monitor_alarm_otherAlarm, "148", "", "otherAlarm", false, true);
    // 弯道超速报警
    this.fillObject(rootElement.lang.alarm_name_178, rootElement.lang.monitor_alarm_otherAlarm, "178", "", "otherAlarm", false, true);
    // 直道超速报警
    this.fillObject(rootElement.lang.alarm_name_180, rootElement.lang.monitor_alarm_otherAlarm, "180", "", "otherAlarm", false, true);
    // 重量增加报警
    this.fillObject(rootElement.lang.alarm_name_1324, rootElement.lang.monitor_alarm_otherAlarm, "1324", "1374", "otherAlarm", false, true);
    // 重量减少报警
    this.fillObject(rootElement.lang.alarm_name_1325, rootElement.lang.monitor_alarm_otherAlarm, "1325", "1375", "otherAlarm", false, true);

    // 临时规则报警 路单报警(中石油)
    if (rootElement.myUserRole && rootElement.myUserRole.isZSYRoadList()) {
        this.fillObject(rootElement.lang.alarm_name_149, rootElement.lang.monitor_alarm_otherAlarm, "149", null, "otherAlarm", false, true);  //超员
        this.fillObject(rootElement.lang.alarm_name_48, rootElement.lang.monitor_alarm_otherAlarm, "48", null, "otherAlarm", false, true);  //超员
    }
    //IO报警
    this.fillObject(rootElement.lang.alarm_type_io1, rootElement.lang.alarm_type_io, "19", "69", "IOAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_io2, rootElement.lang.alarm_type_io, "20", "70", "IOAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_io3, rootElement.lang.alarm_type_io, "21", "71", "IOAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_io4, rootElement.lang.alarm_type_io, "22", "72", "IOAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_io5, rootElement.lang.alarm_type_io, "23", "73", "IOAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_io6, rootElement.lang.alarm_type_io, "24", "74", "IOAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_io7, rootElement.lang.alarm_type_io, "25", "75", "IOAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_io8, rootElement.lang.alarm_type_io, "26", "76", "IOAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_io9, rootElement.lang.alarm_type_io, "41", "91", "IOAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_io10, rootElement.lang.alarm_type_io, "42", "92", "IOAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_io11, rootElement.lang.alarm_type_io, "43", "93", "IOAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_io12, rootElement.lang.alarm_type_io, "44", "94", "IOAlarm", false, true);	//1
    //围栏报警
    this.fillObject(rootElement.lang.alarm_type_fence_in, rootElement.lang.monitor_alarm_fence, "27", "77", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_fence_out, rootElement.lang.monitor_alarm_fence, "28", "78", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_fence_in_overspeed, rootElement.lang.monitor_alarm_fence, "29", "79", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_fence_out_overspeed, rootElement.lang.monitor_alarm_fence, "30", "80", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_fence_in_lowspeed, rootElement.lang.monitor_alarm_fence, "31", "81", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_fence_out_lowspeed, rootElement.lang.monitor_alarm_fence, "32", "82", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_fence_in_stop, rootElement.lang.monitor_alarm_fence, "33", "83", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_fence_out_stop, rootElement.lang.monitor_alarm_fence, "34", "84", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_beyond_bounds, rootElement.lang.monitor_alarm_fence, "12", "62", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_regionalSpeedingAlarm, rootElement.lang.monitor_alarm_fence, "200", "250", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_outOfRegional, rootElement.lang.monitor_alarm_fence, "211", "261", "fenceAlarm", true, true);	//1
    this.fillObject(rootElement.lang.alarm_type_outOfLine, rootElement.lang.monitor_alarm_fence, "212", "262", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_InadequateOrTooLongRoadTravelTime, rootElement.lang.monitor_alarm_fence, "213", "263", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_routeDeviation, rootElement.lang.monitor_alarm_fence, "214", "264", "fenceAlarm", false, true);	//1

    //ADAS报警 monitor_alarm_adas
    //前车碰撞预警
    this.fillObject(rootElement.lang.adas_alarm_type_frontcarcollision, rootElement.lang.monitor_alarm_adas, "400", "450", "adasAlarm", false, true);	//1
    //道路偏离预警
    this.fillObject(rootElement.lang.adas_alarm_type_lane_deviation, rootElement.lang.monitor_alarm_adas, "401", "451", "adasAlarm", false, true);	//1
    //行人检测预警
    this.fillObject(rootElement.lang.adas_alarm_type_pedestrian, rootElement.lang.monitor_alarm_adas, "402", "452", "adasAlarm", false, true);	//1
    //车距近
    this.fillObject(rootElement.lang.adas_alarm_type_shortdistance, rootElement.lang.monitor_alarm_adas, "406", "456", "adasAlarm", false, true);	//1
    //急刹车
    this.fillObject(rootElement.lang.adas_slam_brake, rootElement.lang.monitor_alarm_adas, "407", "457", "adasAlarm", false, true);	//1
    //急左转弯
    this.fillObject(rootElement.lang.alarm_rapid_turnleft, rootElement.lang.monitor_alarm_adas, "408", "458", "adasAlarm", false, true);	//1
    //急右转弯
    this.fillObject(rootElement.lang.alarm_rapid_tturnright, rootElement.lang.monitor_alarm_adas, "409", "459", "adasAlarm", false, true);	//1
    //胎压报警(ADAS)
    this.fillObject(rootElement.lang.tire_alarm, rootElement.lang.monitor_alarm_adas, "168", "169", "adasAlarm", false, true);	//1
    //撞击行人 新疆定制
//	this.fillObject(rootElement.lang.impacting_pedestrians, rootElement.lang.monitor_alarm_adas, "421", "471", "adasAlarm",false,true);	//1
    //驾驶员遮挡或镜头偏离位置
    this.fillObject(rootElement.lang.adas_alarm_type_lens_deviation, rootElement.lang.monitor_alarm_adas, "403", "453", "adasAlarm", false, true);	//1
    //面向警示
    this.fillObject(rootElement.lang.alarm_type_face, rootElement.lang.monitor_alarm_adas, "170", "171", "adasAlarm", false, true);	//1
    //不系安全带
    this.fillObject(rootElement.lang.adas_alarm_type_nobelts, rootElement.lang.monitor_alarm_adas, "404", "454", "adasAlarm", false, true);	//1
    //低头
    this.fillObject(rootElement.lang.adas_alarm_type_belowHead, rootElement.lang.monitor_alarm_adas, "410", "460", "adasAlarm", false, true);	//1

    //疲劳驾驶
    this.fillObject(rootElement.lang.adas_alarm_type_fatigue_one_level, rootElement.lang.over_speed_or_tired, "49", "99", "speendAlarm", false, true);	//1
    //左顾右盼
    this.fillObject(rootElement.lang.adas_alarm_type_leave_driving_sight, rootElement.lang.monitor_alarm_adas, "188", "189", "adasAlarm", false, true);	//1
    //打哈欠
    this.fillObject(rootElement.lang.adas_alarm_type_yawn, rootElement.lang.monitor_alarm_adas, "190", "191", "adasAlarm", false, true);	//1
    if (rootElement.myUserRole && !rootElement.myUserRole.isShieldReport()) {
        //手机警示
        this.fillObject(rootElement.lang.adas_alarm_type_phone_warning, rootElement.lang.monitor_alarm_adas, "174", "175", "adasAlarm", false, true);	//1
        //抽烟警示
        this.fillObject(rootElement.lang.adas_alarm_type_smoking, rootElement.lang.monitor_alarm_adas, "176", "177", "adasAlarm", false, true);	//1
    }
    //闭眼警示
    this.fillObject(rootElement.lang.adas_alarm_type_close_eye_warning, rootElement.lang.monitor_alarm_adas, "172", "173", "adasAlarm", false, true);	//1
    //离岗
    this.fillObject(rootElement.lang.adas_alarm_type_out_work, rootElement.lang.monitor_alarm_adas, "186", "187", "adasAlarm", false, true);	//1
    //面部疲劳
    this.fillObject(rootElement.lang.face_fatigue, rootElement.lang.monitor_alarm_adas, "249", "299", "adasAlarm", false, true);	//1

    //疲劳驾驶预警
    this.fillObject(rootElement.lang.fatigue_warning, rootElement.lang.over_speed_or_tired, "429", "479", "speendAlarm", false, true);
    //前撞预警
    this.fillObject(rootElement.lang.forward_collosion_warning, rootElement.lang.monitor_alarm_adas, "430", "480", "adasAlarm", false, true);
    //车道偏移预警
    this.fillObject(rootElement.lang.lane_offset_warning, rootElement.lang.monitor_alarm_adas, "431", "481", "adasAlarm", false, true);
    //胎压预警
    this.fillObject(rootElement.lang.tire_warning, rootElement.lang.monitor_alarm_adas, "432", "482", "adasAlarm", false, true);
    //侧翻预警
    this.fillObject(rootElement.lang.rollover_warning, rootElement.lang.monitor_alarm_adas, "433", "483", "adasAlarm", false, true);
    //违规行驶
    this.fillObject(rootElement.lang.driving_violations, rootElement.lang.monitor_alarm_adas, "713", "763", "adasAlarm", false, true);
    //右转盲区异常报警
    this.fillObject(rootElement.lang.turn_blind_zone, rootElement.lang.monitor_alarm_adas, "714", "764", "adasAlarm", false, true);
    //急彎/S彎報警
    this.fillObject(rootElement.lang.alarm_name_446_default, rootElement.lang.monitor_alarm_adas, "446", "496", "adasAlarm", false, true);	//1
    //激烈顛簸
    this.fillObject(rootElement.lang.alarm_name_447_default, rootElement.lang.monitor_alarm_adas, "447", "497", "adasAlarm", false, true);	//1


    if (rootElement.myUserRole && rootElement.myUserRole.isPolice()) {
        // //布控人员人脸识别  		150
        // this.fillObject(rootElement.lang.controlListIdentification, rootElement.lang.monitor_alarm_otherAlarm, "150", "", "otherAlarm", true, true);	//1
        // //布控车牌识别  144
        // this.fillObject(rootElement.lang.alarm_name_144_default, rootElement.lang.monitor_alarm_otherAlarm, "144", "", "otherAlarm", true, true);	//1
        //电源低压报警  205  区别于V6报警
        this.fillObject(rootElement.lang.alarm_low_battery_voltage, rootElement.lang.monitor_alarm_otherAlarm, "205", "255", "otherAlarm", true, true);
    }

    //平台报警
    if (!this.isRemovePlatform) {
        this.fillObject(rootElement.lang.alarm_type_areaOverSpeed_platform, rootElement.lang.monitor_alarm_platform, "300", "350", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_type_areaLowSpeed_platform, rootElement.lang.monitor_alarm_platform, "301", "351", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_type_areaInOut_platform, rootElement.lang.monitor_alarm_platform, "302", "352", "platformAlarm", true, true);	//1
        this.fillObject(rootElement.lang.alarm_type_lineInOut_platform, rootElement.lang.monitor_alarm_platform, "303", "353", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_type_overSpeed_platform, rootElement.lang.monitor_alarm_platform, "304", "354", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_type_lowSpeed_platform, rootElement.lang.monitor_alarm_platform, "305", "355", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_306_default, rootElement.lang.monitor_alarm_platform, "306", "356", "platformAlarm", false, true);	//1
        //累计疲劳(平台)
        this.fillObject(rootElement.lang.alarm_name_1121, rootElement.lang.monitor_alarm_platform, "1121", null, "speendAlarm", false, true);
        //日间疲劳(平台)
        this.fillObject(rootElement.lang.alarm_name_1126, rootElement.lang.monitor_alarm_platform, "1126", null, "speendAlarm", false, true);
        //夜间疲劳(平台)
        this.fillObject(rootElement.lang.alarm_name_1127, rootElement.lang.monitor_alarm_platform, "1127", null, "speendAlarm", false, true);
        //日间疲劳(平台)结束
        this.fillObject(rootElement.lang.alarm_name_1128, rootElement.lang.monitor_alarm_platform, "1128", null, "speendAlarm", false, true);
        //夜间疲劳(平台)结束
        this.fillObject(rootElement.lang.alarm_name_1129, rootElement.lang.monitor_alarm_platform, "1129", null, "speendAlarm", false, true);

        //疲劳驾驶预警(平台)       1109
        this.fillObject(rootElement.lang.alarm_name_1109, rootElement.lang.monitor_alarm_platform, "1109", null, "speendAlarm", false, true);  //1
        // 疲劳驾驶预警
        this.fillObject(rootElement.lang.alarm_name_1109, rootElement.lang.monitor_alarm_platform, "1109", "1110", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_type_parkTooLong_platform, rootElement.lang.monitor_alarm_platform, "307", "357", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_type_areaPoint_platform, rootElement.lang.monitor_alarm_platform, "308", "358", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_type_lineOverSpeed_platform, rootElement.lang.monitor_alarm_platform, "309", "359", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_type_lineLowSpeed_platform, rootElement.lang.monitor_alarm_platform, "310", "360", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.report_roadLvlOverSpeed_platform, rootElement.lang.monitor_alarm_platform, "311", "361", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.report_roadLvlOverSpeedWarning_platform, rootElement.lang.monitor_alarm_platform, "1333", null, "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.report_abnormalPosition_platform, rootElement.lang.monitor_alarm_platform, "136", null, "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_type_night_overSpeed_platform, rootElement.lang.monitor_alarm_platform, "314", "364", "platformAlarm", false, true);	//1
        //夜间禁止行车 平台产生
        this.fillObject(rootElement.lang.alarm_type_nightdriving, rootElement.lang.monitor_alarm_platform, "151", "152", "platformAlarm", false, true);	//1
        //离线预警(平台产生)
        this.fillObject(rootElement.lang.vehicle_offline_alarm, rootElement.lang.monitor_alarm_platform, "140", null, "platformAlarm", false, true);	//1
        //超时驾驶 (平台产生)
        this.fillObject(rootElement.lang.report_haiju_driver_alarm, rootElement.lang.monitor_alarm_platform, "145", null, "platformAlarm", false, true);	//1
        //夜间无路单禁止行车(平台)
        if (rootElement.myUserRole && rootElement.myUserRole.isZSYRoadList()) {
            this.fillObject(rootElement.lang.alarm_type_nightdriving_zsy, rootElement.lang.monitor_alarm_platform, "141", "142", "platformAlarm", false, true);	//1
        }
        //ACC信号异常报警(平台)
        this.fillObject(rootElement.lang.acc_signal_abnormal, rootElement.lang.monitor_alarm_platform, "326", "376", "platformAlarm", false, true);	//1
        //位置信息异常报警(平台)
        this.fillObject(rootElement.lang.position_abnormal_alarm, rootElement.lang.monitor_alarm_platform, "327", "377", "platformAlarm", false, true);	//1
        //车辆长时异常离线提醒(平台)
        this.fillObject(rootElement.lang.offline_abnormal_alarm, rootElement.lang.monitor_alarm_platform, "328", "378", "platformAlarm", false, true);	//1
        if (rootElement.myUserRole && rootElement.myUserRole.isHaveRole(6)) {
            this.fillObject(rootElement.lang.muck_truck_cover_alarm, rootElement.lang.monitor_alarm_platform, "333", "383", "platformAlarm", false, true);  //区域非法开盖(平台)
            this.fillObject(rootElement.lang.muck_truck_overload_alarm, rootElement.lang.monitor_alarm_platform, "332", "382", "platformAlarm", false, true);  //区域非法开盖(平台)
            // 区域非法举升(平台)
            this.fillObject(rootElement.lang.muck_truck_lift_alarm, rootElement.lang.monitor_alarm_platform, "348", "398", "platformAlarm", false, true);
        }

        if (!this.isAlarmNoVehicle) {
            // 区域聚集报警(平台)
            this.fillObject(rootElement.lang.alarm_name_340, rootElement.lang.monitor_alarm_platform, "340", "390", "platformAlarm", false, true);	//1
            // 热点区域预警(平台)
            this.fillObject(rootElement.lang.alarm_name_341, rootElement.lang.monitor_alarm_platform, "341", "391", "platformAlarm", false, true);	//1
            // 热点区域报警(平台)
            this.fillObject(rootElement.lang.alarm_name_342, rootElement.lang.monitor_alarm_platform, "342", "392", "platformAlarm", false, true);	//1
        }
        this.fillObject(rootElement.lang.alarm_name_343, rootElement.lang.monitor_alarm_platform, "343", "393", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_344, rootElement.lang.monitor_alarm_otherAlarm, "344", "", "platformAlarm", false, true);


        // GPS中断报警(平台) pamra[0]中断时长， 单位秒
        this.fillObject(rootElement.lang.alarm_name_1101, rootElement.lang.monitor_alarm_platform, "1101", "", "platformAlarm", false, true);	//1
        // 报警漏报(平台)
        this.fillObject(rootElement.lang.alarm_name_1103, rootElement.lang.monitor_alarm_platform, "1103", "", "platformAlarm", false, true);
        // 报警误报(平台)
        this.fillObject(rootElement.lang.alarm_name_1105, rootElement.lang.monitor_alarm_platform, "1105", "", "platformAlarm", false, true);	//1
        // 途经点(平台) param[0]-位置类型 param[1]-关键点ID
        this.fillObject(rootElement.lang.alarm_name_1107, rootElement.lang.monitor_alarm_platform, "1107", "", "platformAlarm", false, true);
        // 到期禁运报警(平台) param[0]-到期类型
        this.fillObject(rootElement.lang.alarm_name_544, rootElement.lang.monitor_alarm_platform, "544", "", "platformAlarm", false, true);
        // 区域超时停车(平台)param[0]-位置类型 param[1]-区域或者线路ID param[2]-停车时长阈值(秒)
        this.fillObject(rootElement.lang.alarm_name_1312, rootElement.lang.monitor_alarm_platform, "1312", "", "platformAlarm", false, true);
        //     1314    //车辆异常离线提醒(平台)   param[0]离线时ACC状态 param[1]离线时速度
        this.fillObject(rootElement.lang.alarm_name_1314, rootElement.lang.monitor_alarm_platform, "1314", "1364", "platformAlarm", false, true);

        if(rootElement.myUserRole && rootElement.myUserRole.isEpidemicSupport()){
            this.fillObject(rootElement.lang.alarm_name_1430, rootElement.lang.monitor_alarm_platform, "1430", "1480", "platformAlarm", false, true);
            this.fillObject(rootElement.lang.alarm_name_1431, rootElement.lang.monitor_alarm_platform, "1431", "1481", "platformAlarm", false, true);
        }

        /*
        // 放到主动安全下面
      // /超速报警一级(平台) alarmInfo:超速率 param[0]速度阀值 param[1]-报警速度 param[2]-速度阙值
        this.fillObject(rootElement.lang.alarm_name_1315, rootElement.lang.monitor_alarm_platform, "1315", "1365", "platformAlarm", false, true);
        // //超速报警二级(平台) alarmInfo:超速率 param[0]速度阀值 param[1]-报警速度 param[2]-速度阙值
        this.fillObject(rootElement.lang.alarm_name_1316, rootElement.lang.monitor_alarm_platform, "1316", "1366", "platformAlarm", false, true);
        // //超速报警三级(平台) alarmInfo:超速率 param[0]速度阀值 param[1]-报警速度 param[2]-速度阙值
        this.fillObject(rootElement.lang.alarm_name_1317, rootElement.lang.monitor_alarm_platform, "1317", "1367", "platformAlarm", false, true);
        //  //超速报警四级(平台) alarmInfo:超速率 param[0]速度阀值 param[1]-报警速度 param[2]-速度阙值
        this.fillObject(rootElement.lang.alarm_name_1318, rootElement.lang.monitor_alarm_platform, "1318", "1368", "platformAlarm", false, true);

        // //疲劳驾驶报警一级(平台)  param[0]:未用 param[1]连续驾驶时长 单位(秒)
        this.fillObject(rootElement.lang.alarm_name_1319, rootElement.lang.monitor_alarm_platform, "1319", "1369", "platformAlarm", false, true);
        // //疲劳驾驶报警二级(平台)  param[0]:未用 param[1]连续驾驶时长 单位(秒)
        this.fillObject(rootElement.lang.alarm_name_1320, rootElement.lang.monitor_alarm_platform, "1320", "1370", "platformAlarm", false, true);
        // //疲劳驾驶报警三级(平台)  param[0]:未用 param[1]连续驾驶时长 单位(秒)
        this.fillObject(rootElement.lang.alarm_name_1321, rootElement.lang.monitor_alarm_platform, "1321", "1371", "platformAlarm", false, true);
        // //疲劳驾驶报警四级(平台)  param[0]:未用 param[1]连续驾驶时长 单位(秒)
        this.fillObject(rootElement.lang.alarm_name_1322, rootElement.lang.monitor_alarm_platform, "1322", "1372", "platformAlarm", false, true);
        // //疲劳驾驶报警五级(平台)  param[0]:未用 param[1]连续驾驶时长 单位(秒)
        this.fillObject(rootElement.lang.alarm_name_1323, rootElement.lang.monitor_alarm_platform, "1323", "1373", "platformAlarm", false, true);
        */
    }
    //平台报警(主动安全)
    if (!this.isRemoveSafety) {
        this.fillObject(rootElement.lang.alarm_name_900 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "900", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_900 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "901", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_900 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "902", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_900 + rootElement.lang.alarm_name_44444, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "948", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_900 + rootElement.lang.alarm_name_55555, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "949", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_903 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "903", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_903 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "904", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_903 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "905", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_903 + rootElement.lang.alarm_name_44444, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "950", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_903 + rootElement.lang.alarm_name_55555, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "951", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_906 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "906", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_906 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "907", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_906 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "908", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_906 + rootElement.lang.alarm_name_44444, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "952", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_906 + rootElement.lang.alarm_name_55555, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "953", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_909 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "909", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_909 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "910", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_909 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "911", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_912 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "912", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_912 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "913", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_912 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "914", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_912 + rootElement.lang.alarm_name_44444, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "954", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_912 + rootElement.lang.alarm_name_55555, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "955", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_915 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "915", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_915 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "916", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_915 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "917", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_915 + rootElement.lang.alarm_name_44444, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "956", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_915 + rootElement.lang.alarm_name_55555, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "957", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_918 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "918", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_918 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "919", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_918 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "920", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_918 + rootElement.lang.alarm_name_44444, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "958", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_918 + rootElement.lang.alarm_name_55555, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "959", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_921 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "921", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_921 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "922", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_921 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "923", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_921 + rootElement.lang.alarm_name_55555, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "960", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_924 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "924", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_924 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "925", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_924 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "926", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_924 + rootElement.lang.alarm_name_44444, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "961", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_924 + rootElement.lang.alarm_name_55555, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "962", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_927 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "927", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_927 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "928", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_927 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "929", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_930 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "930", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_930 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "931", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_930 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "932", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_933 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "933", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_933 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "934", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_933 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "935", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_933 + rootElement.lang.alarm_name_44444, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "963", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_933 + rootElement.lang.alarm_name_55555, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "964", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_936 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "936", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_936 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "937", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_936 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "938", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_939 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "939", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_939 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "940", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_939 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "941", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_939 + rootElement.lang.alarm_name_44444, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "965", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_939 + rootElement.lang.alarm_name_55555, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "966", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_942 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "942", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_942 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "943", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_942 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "944", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_945 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "945", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_945 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "946", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_945 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "947", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_967 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "967", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_967 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "637", "687", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_967 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "968", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_967 + rootElement.lang.alarm_name_44444, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "969", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_967 + rootElement.lang.alarm_name_55555, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "970", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_971 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "971", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_971 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "972", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_971 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "973", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_971 + rootElement.lang.alarm_name_44444, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "974", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_971 + rootElement.lang.alarm_name_55555, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "975", "", "safetyPlatformAlarm", false, true);	//1


        this.fillObject(rootElement.lang.alarm_name_1334 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1334", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1334 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1335", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1334 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1336", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1337 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1337", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1337 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1338", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1337 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1339", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1340 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1340", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1340 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1341", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1340 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1342", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1343 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1343", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1343 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1344", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1343 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1345", "", "safetyPlatformAlarm", false, true);	//1

        // /超速报警一级(平台) alarmInfo:超速率 param[0]速度阀值 param[1]-报警速度 param[2]-速度阙值
        this.fillObject(rootElement.lang.alarm_name_1315, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1315", "1365", "safetyPlatformAlarm", false, true);
        // //超速报警二级(平台) alarmInfo:超速率 param[0]速度阀值 param[1]-报警速度 param[2]-速度阙值
        this.fillObject(rootElement.lang.alarm_name_1316, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1316", "1366", "safetyPlatformAlarm", false, true);
        // //超速报警三级(平台) alarmInfo:超速率 param[0]速度阀值 param[1]-报警速度 param[2]-速度阙值
        this.fillObject(rootElement.lang.alarm_name_1317, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1317", "1367", "safetyPlatformAlarm", false, true);
        //  //超速报警四级(平台) alarmInfo:超速率 param[0]速度阀值 param[1]-报警速度 param[2]-速度阙值
        this.fillObject(rootElement.lang.alarm_name_1318, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1318", "1368", "safetyPlatformAlarm", false, true);
        //  //超速报警五级(平台) alarmInfo:超速率 param[0]速度阀值 param[1]-报警速度 param[2]-速度阙值
        this.fillObject(rootElement.lang.alarm_name_1346, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1346", "1396", "safetyPlatformAlarm", false, true);
        // //疲劳驾驶报警一级(平台)  param[0]:未用 param[1]连续驾驶时长 单位(秒)
        this.fillObject(rootElement.lang.alarm_name_1319, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1319", "1369", "safetyPlatformAlarm", false, true);
        // //疲劳驾驶报警二级(平台)  param[0]:未用 param[1]连续驾驶时长 单位(秒)
        this.fillObject(rootElement.lang.alarm_name_1320, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1320", "1370", "safetyPlatformAlarm", false, true);
        // //疲劳驾驶报警三级(平台)  param[0]:未用 param[1]连续驾驶时长 单位(秒)
        this.fillObject(rootElement.lang.alarm_name_1321,rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1321", "1371", "safetyPlatformAlarm", false, true);
        // //疲劳驾驶报警四级(平台)  param[0]:未用 param[1]连续驾驶时长 单位(秒)
        this.fillObject(rootElement.lang.alarm_name_1322, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1322", "1372", "safetyPlatformAlarm", false, true);
        // //疲劳驾驶报警五级(平台)  param[0]:未用 param[1]连续驾驶时长 单位(秒)
        this.fillObject(rootElement.lang.alarm_name_1323, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1323", "1373", "safetyPlatformAlarm", false, true);
    }
    //主动安全设备
    //后方接近报警
    if (!this.isRemoveSafety) {
        //ADAS类
        //低速前车碰撞预警1级
        this.fillObject(rootElement.lang.alarm_name_840 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "840", "890", "activeSafetyAdas", false, true); //1
        //低速前车碰撞预警 2级
        this.fillObject(rootElement.lang.alarm_name_840 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "841", "891", "activeSafetyAdas", false, true); //1
        //前向碰撞报警1级
        this.fillObject(rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "600", "650", "activeSafetyAdas", false, true);	//1
        //前向碰撞报警 2级
        this.fillObject(rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "601", "651", "activeSafetyAdas", false, true);	//1
        //车道偏离报警1级
        this.fillObject(rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "602", "652", "activeSafetyAdas", false, true);	//1
        //车道偏离报警 2级
        this.fillObject(rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "603", "653", "activeSafetyAdas", false, true);	//1
        //道路标识超限报警 2级
        this.fillObject(rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "610", "660", "activeSafetyAdas", false, true);	//1
        //道路标识超限报警 1级
        this.fillObject(rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "611", "661", "activeSafetyAdas", false, true);	//1
        //频繁变道  2级
        this.fillObject(rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "608", "658", "activeSafetyAdas", false, true);	//1
        //频繁变道  1级
        this.fillObject(rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "609", "659", "activeSafetyAdas", false, true);	//1
        //行人碰撞报警  2级
        this.fillObject(rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "606", "656", "activeSafetyAdas", false, true);	//1
        //行人碰撞报警  1级
        this.fillObject(rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "607", "657", "activeSafetyAdas", false, true);	//1
        //车距过近报警 2级
        this.fillObject(rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "604", "654", "activeSafetyAdas", false, true);	//1
        //车距过近报警 1级
        this.fillObject(rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "605", "655", "activeSafetyAdas", false, true);	//1
        //障碍物报警 2级
        this.fillObject(rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "612", "662", "activeSafetyAdas", false, true);	//1
        //障碍物报警 1级
        this.fillObject(rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "613", "663", "activeSafetyAdas", false, true);	//1
        //弯道车速预警1级
        this.fillObject(rootElement.lang.alarm_name_700 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "700", "750", "activeSafetyAdas", false, true);	//1
        //弯道车速预警2级
        this.fillObject(rootElement.lang.alarm_name_700 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "701", "751", "activeSafetyAdas", false, true);	//1
        //// 715    //驾驶辅助功能失效报警1级
        this.fillObject(rootElement.lang.alarm_name_715 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "715", "765", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_715 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "716", "766", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_728 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "728", "778", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_728 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "729", "779", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_730 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "730", "780", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_730 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "731", "781", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_732 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "732", "782", "activeSafetyAdas", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_732 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "733", "783", "activeSafetyAdas", false, true);	//1

        this.fillObject(rootElement.lang.alarm_name_542 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "542", "592", "activeSafetyAdas", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_542 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "543", "593", "activeSafetyAdas", false, true); //1

        // 黑车报警
        this.fillObject(rootElement.lang.alarm_name_530 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "530", "580", "activeSafetyAdas", false, true);
        this.fillObject(rootElement.lang.alarm_name_530 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "531", "581", "activeSafetyAdas", false, true);
        this.fillObject(rootElement.lang.alarm_name_532 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "532", "582", "activeSafetyAdas", false, true);
        this.fillObject(rootElement.lang.alarm_name_532 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "533", "583", "activeSafetyAdas", false, true);
        this.fillObject(rootElement.lang.alarm_name_534 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "534", "584", "activeSafetyAdas", false, true);
        this.fillObject(rootElement.lang.alarm_name_534 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "535", "585", "activeSafetyAdas", false, true);
        this.fillObject(rootElement.lang.alarm_name_536 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "536", "586", "activeSafetyAdas", false, true);
        this.fillObject(rootElement.lang.alarm_name_536 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "537", "587", "activeSafetyAdas", false, true);

        if (!hideEvent) {
            //主动抓拍事件 2级
            this.fillObject(rootElement.lang.alarm_name_616 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "616", null, "activeSafetyAdas", false, true);	//1
            //主动抓拍事件 1级
            this.fillObject(rootElement.lang.alarm_name_616 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "617", null, "activeSafetyAdas", false, true);	//1
            //道路标志识别事件 2级
            this.fillObject(rootElement.lang.alarm_name_614 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "614", null, "activeSafetyAdas", false, true);	//1
            //道路标志识别事件 1级
            this.fillObject(rootElement.lang.alarm_name_614 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "615", null, "activeSafetyAdas", false, true);	//1
        }

        //DSM类
        //抽烟报警  2级
        this.fillObject(rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "622", "672", "activeSafetyDsm", false, true);	//1
        //抽烟报警  1级
        this.fillObject(rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "623", "673", "activeSafetyDsm", false, true);	//1
        //接打电话报警  2级
        this.fillObject(rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "620", "670", "activeSafetyDsm", false, true);	//1
        //接打电话报警  1级
        this.fillObject(rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "621", "671", "activeSafetyDsm", false, true);	//1

        //疲劳驾驶报警 2级
        this.fillObject(rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "618", "668", "activeSafetyDsm", false, true);	//1
        //疲劳驾驶报警 1级
        this.fillObject(rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "619", "669", "activeSafetyDsm", false, true);	//1
        //驾驶员异常报警  2级
        this.fillObject(rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "626", "676", "activeSafetyDsm", false, true);	//1
        //驾驶员异常报警  1级
        this.fillObject(rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "627", "677", "activeSafetyDsm", false, true);	//1

        //分神驾驶报警  2级
        this.fillObject(rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "624", "674", "activeSafetyDsm", false, true);	//1
        //分神驾驶报警  1级
        this.fillObject(rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "625", "675", "activeSafetyDsm", false, true);	//1
        //长时间不目视前方报警1级
        this.fillObject(rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "702", "752", "activeSafetyDsm", false, true);	//1
        //长时间不目视前方报警2级
        this.fillObject(rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "703", "753", "activeSafetyDsm", false, true);	//1
        //系统不能正常工作报警1级
        this.fillObject(rootElement.lang.alarm_name_704 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "704", "754", "activeSafetyDsm", false, true);	//1
        //系统不能正常工作报警2级
        this.fillObject(rootElement.lang.alarm_name_704 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "705", "755", "activeSafetyDsm", false, true);	//1
        //驾驶员未系安全带报警1级
        this.fillObject(rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "706", "756", "activeSafetyDsm", false, true);	//1
        //驾驶员未系安全带报警2级
        this.fillObject(rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "707", "757", "activeSafetyDsm", false, true);	//1

        //驾驶员不在驾驶位报警1级
        this.fillObject(rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "708", "758", "activeSafetyDsm", false, true);	//1
        //驾驶员不在驾驶位报警2级
        this.fillObject(rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "709", "759", "activeSafetyDsm", false, true);	//1
        //驾驶员双手脱离方向盘报警1级
        this.fillObject(rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "710", "760", "activeSafetyDsm", false, true);	//1
        //驾驶员双手脱离方向盘报警2级
        this.fillObject(rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "711", "761", "activeSafetyDsm", false, true);	//1
        ////喝水报警 1级
        this.fillObject(rootElement.lang.alarm_name_644 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "644", "694", "activeSafetyDsm", false, true);	//1
        ////喝水报警 2级
        this.fillObject(rootElement.lang.alarm_name_644 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "645", "695", "activeSafetyDsm", false, true);	//1
//		if(!enableSubiao()){
        //驾驶员IC卡异常报警1级
        this.fillObject(rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "641", "691", "activeSafetyDsm", false, true);	//1
        //驾驶员IC卡异常报警2级
        this.fillObject(rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "642", "692", "activeSafetyDsm", false, true);	//1
        //驾驶员身份识别事件
        /*  if (!hideEvent) {
              this.fillObject(rootElement.lang.alarm_name_643, rootElement.lang.abnormality, "643", null, "activeSafetyDsm", false, true);	//1
          }*/
//        }
        //// 717 //驾驶员行为监测功能失效报警1级
        this.fillObject(rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "717", "767", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "718", "768", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_719, rootElement.lang.abnormality, "719", null, "activeSafetyDsm", false, true);	//1
        // DSM(其他地方)
        this.fillObject(rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "734", "784", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "735", "785", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "736", "786", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "737", "787", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "738", "788", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "739", "789", "activeSafetyDsm", false, true);	//1
//		if(rootElement.myUserRole && rootElement.myUserRole.isIsSunglassFailure()){
        //墨镜失效一级报警
        this.fillObject(rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "639", "689", "activeSafetyDsm", false, true);	//1
        //墨镜失效2级报警
        this.fillObject(rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "640", "690", "activeSafetyDsm", false, true);	//1
//		}
        //单手脱离方向盘
        this.fillObject(rootElement.lang.alarm_name_745 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "745", "795", "activeSafetyDsm", false, true);
        this.fillObject(rootElement.lang.alarm_name_745 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "746", "796", "activeSafetyDsm", false, true);
        if (!hideEvent) {
            //驾驶员变更事件 2级
            this.fillObject(rootElement.lang.alarm_name_630 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "630", null, "activeSafetyDsm", false, true);	//1
            //驾驶员变更事件 1级
            this.fillObject(rootElement.lang.alarm_name_630 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "631", null, "activeSafetyDsm", false, true);	//1
            //自动抓拍事件 2级
            this.fillObject(rootElement.lang.alarm_name_628 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "628", null, "activeSafetyDsm", false, true);	//1
            //自动抓拍事件 1级
            this.fillObject(rootElement.lang.alarm_name_628 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "629", null, "activeSafetyDsm", false, true);	//1
        }
        if (!hideEvent) {
            this.fillObject(rootElement.lang.alarm_name_843, rootElement.lang.abnormality, "843", "", "activeSafetyDsm", false, true); //1
            this.fillObject(rootElement.lang.alarm_name_844, rootElement.lang.abnormality, "844", "", "activeSafetyDsm", false, true); //1
            this.fillObject(rootElement.lang.alarm_name_847, rootElement.lang.abnormality, "847", "", "activeSafetyDsm", false, true); //1
            this.fillObject(rootElement.lang.alarm_name_842, rootElement.lang.abnormality, "842", "", "activeSafetyDsm", false, true); //1
        }
        this.fillObject(rootElement.lang.alarm_name_845 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "845", "895", "activeSafetyDsm", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_845 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "846", "896", "activeSafetyDsm", false, true); //1
        if(rootElement.myUserRole && rootElement.myUserRole.isEpidemicSupport()){
            this.fillObject(rootElement.lang.alarm_name_1429, rootElement.lang.abnormality,"1429", "1479", "activeSafetyDsm", false, true); //1
        }


        //tmps 胎压
        //胎压报警
        this.fillObject(rootElement.lang.alarm_name_632, rootElement.lang.tmps, "632", "682", "activeSafetyTmps", false, true);	//1
        //BDS接近报警
        //后方接近报警
        this.fillObject(rootElement.lang.alarm_name_633, rootElement.lang.proximity, "633", "683", "activeSafetyProximity", false, true);	//1
        //左侧后方接近报警
        this.fillObject(rootElement.lang.alarm_name_634, rootElement.lang.proximity, "634", "684", "activeSafetyProximity", false, true);	//1
        //右侧后方接近报警
        this.fillObject(rootElement.lang.alarm_name_635, rootElement.lang.proximity, "635", "685", "activeSafetyProximity", false, true);	//1
        //激烈驾驶
        //激烈驾驶报警(川标)
        this.fillObject(rootElement.lang.alarm_name_720, rootElement.lang.fierce_driving_type, "720", "770", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_721, rootElement.lang.fierce_driving_type, "721", "771", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_722, rootElement.lang.fierce_driving_type, "722", "772", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_723, rootElement.lang.fierce_driving_type, "723", "773", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_724, rootElement.lang.fierce_driving_type, "724", "774", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_725, rootElement.lang.fierce_driving_type, "725", "775", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_726, rootElement.lang.fierce_driving_type, "726", "776", "activeSafetyFierce", false, true);	//1

        //智能检测
        this.fillObject(rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_11111, rootElement.lang.znjc, "740", "790", "activeSafetyZnjc", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_22222, rootElement.lang.znjc, "741", "791", "activeSafetyZnjc", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_11111, rootElement.lang.znjc, "742", "792", "activeSafetyZnjc", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_22222, rootElement.lang.znjc, "743", "793", "activeSafetyZnjc", false, true);	//1

        //卫星定位报警(川标)
        this.fillObject(rootElement.lang.alarm_name_727, rootElement.lang.satellite_positioning_type, "727", "777", "activeSafetySatellite", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_744, rootElement.lang.satellite_positioning_type, "744", "794", "activeSafetySatellite", false, true);	//1

        // 黑龙江
        this.addHeiLongJiangAlarm();
        // 湖南（湘标）
        this.addHuNanAlarm();
        // 渣土车主动安全
        this.addMuckAlarm();
        // 北京主动安全
        this.addBeiJingAlarm();
        // 酒测
        this.addWineTestAlarm();
        // 四川
        this.addSiChuanAlarm();
    }
    //驾驶员身份识别
    //驾驶员识别事件(平台)
    /*this.fillObject(rootElement.lang.driver_identification_event_platform, rootElement.lang.driver_identification_event, "636", null, "driverIdentification", false, true);	//1
    *///动态查岗(平台)
    /*this.fillObject(rootElement.lang.dynamic_check_platform, rootElement.lang.driver_identification_event, "686", null, "driverIdentification", false, true);	//1
    *///插卡比对身份识别上报事件
    /*this.fillObject(rootElement.lang.card_comparison_identification_reporting_event, rootElement.lang.driver_identification_event, "646", null, "driverIdentification", false, true);	//1
    *///巡检比对身份识别上报事件
    /*this.fillObject(rootElement.lang.patrol_comparison_identification_reporting_event, rootElement.lang.driver_identification_event, "647", null, "driverIdentification", false, true);	//1
    *///点火比对身份识别上报事件
    /*this.fillObject(rootElement.lang.ignition_ratio_identification_report_event, rootElement.lang.driver_identification_event, "648", null, "driverIdentification", false, true);	//1
    *///离开返回比对身份识别上报事件
    /*this.fillObject(rootElement.lang.leave_return_to_compare_the_identity_report_event, rootElement.lang.driver_identification_event, "649", null, "driverIdentification", false, true);	//1
    *///驾驶员识别事件
    this.fillObject(rootElement.lang.net_alarm_type_sb_driver_identification, rootElement.lang.net_alarm_type_sb_driver_identification, "696", null, "driverIdentification", false, true);	//1
    // 人证不符报警(平台)
    this.fillObject(rootElement.lang.alarm_name_664, rootElement.lang.net_alarm_type_sb_driver_identification, "664", null, "driverIdentification", false, true);	//1
    //刷脸签到身份识别上报事件
    /*this.fillObject(rootElement.lang.face_sign_report_identity_incident, rootElement.lang.driver_identification_event, "697", null, "driverIdentification", false, true);	//1
    *///动态查岗身份识别上报事件
    /*this.fillObject(rootElement.lang.dynamic_check_post_identification_event, rootElement.lang.driver_identification_event, "698", null, "driverIdentification", false, true);	//1
    *///GSensor启动
    this.fillObject(rootElement.lang.alarm_GSensorStart, rootElement.lang.alarm_GSensor_type, "439", "489", "gSensor", false, true);
    //GSensor停止
    this.fillObject(rootElement.lang.alarm_GSensorStop, rootElement.lang.alarm_GSensor_type, "440", "490", "gSensor", false, true);
    //GSensor侧翻
    this.fillObject(rootElement.lang.alarm_GSensorRollOver, rootElement.lang.alarm_GSensor_type, "441", "491", "gSensor", false, true);
    this.fillObject(rootElement.lang.alarm_type_rapidAcceleration, rootElement.lang.alarm_GSensor_type, "246", "296", "gSensor", false, true);	//1
    this.fillObject(rootElement.lang.alarm_type_rapidDeceleration, rootElement.lang.alarm_GSensor_type, "247", "297", "gSensor", false, true);	//1
    //碰撞侧翻
    this.fillObject(rootElement.lang.alarm_type_rollover, rootElement.lang.alarm_GSensor_type, "219", "269", "gSensor", false, true);	//1
    //急转弯
    this.fillObject(rootElement.lang.alarm_type_sharpTurn, rootElement.lang.alarm_GSensor_type, "444", "494", "gSensor", false, true);
    //上下线报警
    this.fillObject(rootElement.lang.alarm_type_device_online, rootElement.lang.monitor_alarm_login, "17", null, "loginAlarm", true, true);	//1
    // 下线报警
    this.fillObject(rootElement.lang.alarm_type_device_disOnline, rootElement.lang.monitor_alarm_login, "67", null, "loginAlarm", true, true);	//1
    if (alarmType === 10) { //报警推送设置需要查岗、督办等自定义报警 苏标报警附件上传完成通知事件
        //自定义报警
        //平台查岗
        this.fillObject(rootElement.lang.platformInspect, rootElement.lang.manage_my_government, ((113 << 16) + 21).toString(), null, "government", false, true);	//1
        //报警督办
        this.fillObject(rootElement.lang.alarmSupervision, rootElement.lang.manage_my_government, ((113 << 16) + 29).toString(), null, "government", false, true);	//1
        //this.fillObject(rootElement.lang.alarm_type_custom_alarm, rootElement.lang.alarm_type_custom_alarm,"113",null,"customAlarm",true,true);	//1
        this.fillObject(rootElement.lang.alarmAttachmentUploaded, rootElement.lang.alarm_type_custom_alarm, "638", null, "customAlarm", false, true);	//1
    }
    if (alarmType == 'custom') {
        this.fillObject(rootElement.lang.alarm_type_custom_alarm, rootElement.lang.alarm_type_custom_alarm, "113", null, "customAlarm", true, true);	//1
    }

    // 渣土车相关的报警
    // 渣土车相关报警,报警结束类型在开始类型基础上加50,此处不增加报警结束定义
    this.fillObject(rootElement.lang.alarm_name_820, rootElement.lang.muck_alarm, "820", "870", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_821, rootElement.lang.muck_alarm, "821", "871", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_822, rootElement.lang.muck_alarm, "822", "872", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_823, rootElement.lang.muck_alarm, "823", "873", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_824, rootElement.lang.muck_alarm, "824", "874", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_825, rootElement.lang.muck_alarm, "825", "875", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_826, rootElement.lang.muck_alarm, "826", "876", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_827, rootElement.lang.muck_alarm, "827", "877", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_828, rootElement.lang.muck_alarm, "828", "878", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_829, rootElement.lang.muck_alarm, "829", "879", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_830, rootElement.lang.muck_alarm, "830", "880", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_831, rootElement.lang.muck_alarm, "831", "881", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_832, rootElement.lang.muck_alarm, "832", "882", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_833, rootElement.lang.muck_alarm, "833", "883", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_834, rootElement.lang.muck_alarm, "834", "884", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_835, rootElement.lang.muck_alarm, "835", "885", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_836, rootElement.lang.muck_alarm, "836", "886", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_837, rootElement.lang.muck_alarm, "837", "887", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_838, rootElement.lang.muck_alarm, "838", "888", "muckAlarm", false, true);


    // 渣土车新报警协议
    this.addMuckAlarm(1);

    // 黑车报警 1级
    /*this.fillObject(rootElement.lang.alarm_name_530, rootElement.lang.muck_alarm, "530", "580", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_532, rootElement.lang.muck_alarm, "532", "582", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_534, rootElement.lang.muck_alarm, "534", "584", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_536, rootElement.lang.muck_alarm, "536", "586", "muckAlarm", false, true);
*/
    // 黑车报警 2级
    /*this.fillObject(rootElement.lang.alarm_name_530, rootElement.lang.muck_alarm, "531", "581", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_532, rootElement.lang.muck_alarm, "533", "583", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_534, rootElement.lang.muck_alarm, "535", "585", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_536, rootElement.lang.muck_alarm, "537", "587", "muckAlarm", false, true);
*/
    //电子锁报警
    this.addLockAlarm();
}


/**
 * 新增电子锁报警
 */
AlarmManager.prototype.addLockAlarm = function () {
    this.fillObject(rootElement.lang.alarm_name_1003, rootElement.lang.electronicLock, "1003", "1053", "lockAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1004, rootElement.lang.electronicLock, "1004", "1054", "lockAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1005, rootElement.lang.electronicLock, "1005", "1055", "lockAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1006, rootElement.lang.electronicLock, "1006", "1056", "lockAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1007, rootElement.lang.electronicLock, "1007", "1057", "lockAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1008, rootElement.lang.electronicLock, "1008", "1058", "lockAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1009, rootElement.lang.electronicLock, "1009", "1059", "lockAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1010, rootElement.lang.electronicLock, "1010", "1060", "lockAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1012, rootElement.lang.electronicLock, "1012", "1062", "lockAlarm", false, true);
}



/**
 * 报警初始化数据信息
 * @param name  报警名称
 * @param parentName  报警父节点名称  用于联动
 * @param armType     报警开始标识
 * @param armEnd    报警结束标识
 * @param classify  报警分类
 * @param isPolice  是否警员类型
 * @param isAlarmLinkage 是否报警联动需要的类型
 */
AlarmManager.prototype.fillObject = function (name, parentName, armType, armEnd, classify, isPolice, isAlarmLinkage) {

    if(this.shieldArmType.length > 0 && this.shieldArmType.contains(armType)){
        return;
    }

    //如果是报警联动，则只需要加载所需的报警类型
    if ((this.isAlarmLinkage && isAlarmLinkage) || !this.isAlarmLinkage) {

        if (armType == '6321' || armType == '6322' || armType == '6323') {
            //这三个报警不做过滤
        } else if (this.alarmFilter) {
            if (classify == "activeSafetyZnjc" || classify == "activeSafetyFierce" ||
                classify == "activeSafetyProximity" || classify == "activeSafetyTmps" ||
                classify == "activeSafetyDsm" || classify == "activeSafetyAdas" || classify == "activeSafetySatellite" ||
                classify == "activeSafetyDriverIdentification" || classify == "activeSafetyVehicleOperationMonitoring" ||
                classify == "activeSafetyEquipmentFailureMonitoring") {
                //优先使用主类(最大长度为6)indexOf
                if ((this.alarmFilter.type && this.alarmFilter.mainTypes.indexOf(classify) > -1) /*||
					(this.alarmFilter.typeStr && this.alarmFilter.typeStr.indexOf(armType) > -1) */
                ) {
                    if (armType.indexOf('-') != -1) {
                        var amrTypes = armType.split('-');
                        if ((this.alarmFilter.type.indexOf(amrTypes[0]) === -1) && (this.alarmFilter.type.indexOf(amrTypes[1]) === -1)) {
                            return;
                        }
                    } else {
                        if (this.alarmFilter.type.indexOf(armType) === -1) {
                            return;
                        }
                    }
                } else {
                    return;
                }
            }
        }
        var obj = new alarmTypeObject();
        obj.setName(name);
        obj.setParentName(parentName);
        obj.setArmType(armType);
        obj.setArmEnd(armEnd);
        obj.setClassify(classify);
        if (isPolice != undefined && isPolice != null) {
            obj.setIsPolice(isPolice);
        }
        if (isAlarmLinkage != undefined && isAlarmLinkage != null) {
            obj.setAlarmLinkage(isAlarmLinkage);
        }
        this.addAlarmObject(obj);
    }
}
/**
 * 追加黑车报警
 */
AlarmManager.prototype.addBlackVehicleAlarm = function () {
    // 黑车报警
    this.fillObject(rootElement.lang.alarm_name_530 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "530", "580", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_530 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "531", "581", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_532 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "532", "582", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_532 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "533", "583", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_534 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "534", "584", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_534 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "535", "585", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_536 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "536", "586", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_536 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "537", "587", "activeSafetyAdas", false, true);
}

//新增alarmObject
AlarmManager.prototype.addAlarmObject = function (alarmObject) {
    var lstClass = this.lstAlarmClassify;
    var classType = alarmObject.classify;
    var isExist = true;//是否已经存在
    if (alarmObject.isVehicle) {
        isExist = false;//默认当前数据可以新增
        if (lstClass.length > 0) {
            for (var i = 0; i < lstClass.length; i++) {
                if (lstClass[i].id == classType) {
                    isExist = true;
                    break;
                }
            }
        }
    }
    if (!isExist) {
        this.lstAlarmClassify.push({id: classType, name: alarmObject.parentName});
    }

    var val = alarmObject.armType;
    if (alarmObject.armEnd != null && alarmObject.armEnd != "") {
        val += "," + alarmObject.armEnd;
    }
    alarmObject.realType = val;
    this.lstAlarmTypeOjbect.push(alarmObject);
}

//初始化报警类型树
//type  1为联动报警  2屏蔽联动 809:809报警
//type  1报警类型存为开始报警类型   2报警类型存为报警开始类型,报警结束类型
AlarmManager.prototype.initAlarmTree = function (type) {
    //加载树树
    var that = this;
    var alarmTree = new dhtmlXTreeObject("alarm_tree", "100%", "100%", 0);
    alarmTree.setImagePath("../../js/dxtree/imgs/");
    alarmTree.enableCheckBoxes(1);
    alarmTree.enableThreeStateCheckboxes(true);
    var data = [];
    if (type == 809) {
        var lst809AlarmTypeOjbect = this.lst809AlarmTypeOjbect;
        for (var i = 0; i < lst809AlarmTypeOjbect.length; i++) {
            var obj = lst809AlarmTypeOjbect[i];
            alarmTree.insertNewItem(obj.parentId, obj.id, obj.name, 0, "all_group.gif", "all_group.gif", "all_group.gif", 'SELECT');
            data.push({id: obj.id, name: obj.name});
        }
    } else if (rootElement.myUserRole && rootElement.myUserRole.isPolice()) {
        for (var i = 0; i < that.lstAlarmTypeOjbect.length; i++) {
            if (that.lstAlarmTypeOjbect[i].isPolice) {
                if (type == 1) {
                    data.push({id: that.lstAlarmTypeOjbect[i].armType, name: that.lstAlarmTypeOjbect[i].name});
                    alarmTree.insertNewItem("0", that.lstAlarmTypeOjbect[i].armType, that.lstAlarmTypeOjbect[i].name, 0, "all_group.gif", "all_group.gif", "all_group.gif", 'SELECT');
                } else if (type == 2) {
                    data.push({id: that.lstAlarmTypeOjbect[i].realType, name: that.lstAlarmTypeOjbect[i].name});
                    alarmTree.insertNewItem("0", that.lstAlarmTypeOjbect[i].realType, that.lstAlarmTypeOjbect[i].name, 0, "all_group.gif", "all_group.gif", "all_group.gif", 'SELECT');
                }
            }
        }
    } else {
        //保存分类
        for (var i = 0; i < that.lstAlarmClassify.length; i++) {
            alarmTree.insertNewItem("0", that.lstAlarmClassify[i].id, that.lstAlarmClassify[i].name, 0, "all_group.gif", "all_group.gif", "all_group.gif", 'SELECT');
        }
        //保存到对应的分类里面
        for (var j = 0; j < that.lstAlarmTypeOjbect.length; j++) {
            if (that.lstAlarmTypeOjbect[j].isVehicle) {
                if (type == 1) {
                    data.push({id: that.lstAlarmTypeOjbect[j].armType, name: that.lstAlarmTypeOjbect[j].name});
                    alarmTree.insertNewItem(that.lstAlarmTypeOjbect[j].classify, that.lstAlarmTypeOjbect[j].armType, that.lstAlarmTypeOjbect[j].name, 0, "all_group.gif", "all_group.gif", "all_group.gif", 'SELECT');
                } else if (type == 2) {
                    data.push({id: that.lstAlarmTypeOjbect[j].realType, name: that.lstAlarmTypeOjbect[j].name});
                    alarmTree.insertNewItem(that.lstAlarmTypeOjbect[j].classify, that.lstAlarmTypeOjbect[j].realType, that.lstAlarmTypeOjbect[j].name, 0, "all_group.gif", "all_group.gif", "all_group.gif", 'SELECT');
                }
            }
        }
    }
    alarmTree.closeAllItems();
    // 筛选的数据 {}
    alarmTree.addSearchInput(data);
    return alarmTree;
};

//初始化报警类型数组
AlarmManager.prototype.initAlarmTypes = function () {
    var that = this;
    var alarmTypes = [];
    var allTypes = [];
    if (rootElement.myUserRole && rootElement.myUserRole.isPolice()) {
        for (var i = 0; i < that.lstAlarmTypeOjbect.length; i++) {
            if (that.lstAlarmTypeOjbect[i].isPolice) {
                allTypes.push(that.lstAlarmTypeOjbect[i].armType);
            }
        }
        if (allTypes.length > 0) {
            alarmTypes.push({id: allTypes.join(','), name: rootElement.lang.all});
        }
        for (var i = 0; i < that.lstAlarmTypeOjbect.length; i++) {
            if (that.lstAlarmTypeOjbect[i].isPolice) {
                alarmTypes.push({id: that.lstAlarmTypeOjbect[i].armType, name: that.lstAlarmTypeOjbect[i].name});
                that.allId.push(that.lstAlarmTypeOjbect[i].armType);
            }
        }
    } else {
        for (var i = 0; i < that.lstAlarmTypeOjbect.length; i++) {
            if (that.lstAlarmTypeOjbect[i].isVehicle) {
                allTypes.push(that.lstAlarmTypeOjbect[i].armType);
            }
        }
        if (allTypes.length > 0) {
            alarmTypes.push({id: allTypes.join(','), name: rootElement.lang.all});
        }
        for (var i = 0; i < that.lstAlarmTypeOjbect.length; i++) {
            if (that.lstAlarmTypeOjbect[i].isVehicle) {
                alarmTypes.push({id: that.lstAlarmTypeOjbect[i].armType, name: that.lstAlarmTypeOjbect[i].name});
                that.allId.push(that.lstAlarmTypeOjbect[i].armType);
            }
        }
    }
    return alarmTypes;
}

/**
 * 当勾选下线报警时
 */
AlarmManager.prototype.addOutLineAction = function (tree) {

    // private
    var hideVideoBus = function () {
        $('.th-preview').parent().hide();
        $('.th-previewChannel').parent().hide();
        $('.th-previewTime').parent().hide();
    }

    var showVideoBus = function () {
        $('.th-preview').parent().show();
        $('.th-previewChannel').parent().show();
        $('.th-previewTime').parent().show();
    }
    // 处理业务
    var dealBus = function (nodeId) {
        if (nodeId && nodeId == 67) {
            hideVideoBus();
        } else {
            showVideoBus();
        }
    }

    var onTreeClick = function () {
        // 获取选中的节点
        var nodeId = tree.getSelectedItemId();
        // 如果只选中设备下线，则屏蔽掉视频业务
        dealBus(nodeId);
    }

    var onSelectFun = function () {
        // 获取选中的节点 不包括父节点
        var clickNode = tree.getAllChecked();
        dealBus(clickNode);
    }

    $('.dhx_bg_img_fix').on('click', onSelectFun);

    tree.attachEvent("onClick", onTreeClick);
}

/**
 * 排除报警
 */
AlarmManager.prototype.excluedAlarm = function (alarmList) {
    if (!alarmList) {
        return;
    }
    this.lstAlarmTypeOjbect = this.lstAlarmTypeOjbect.filter(function (val, index, arr) {
        return !alarmList.contains(val.armType);
    })
}


/**
 * 初始化Tab框
 * @returns {Array}
 */
AlarmManager.prototype.initGroupModel = function (displayLang) {
    var mod = [];

    var that = this;
    var widths = [screenWidth / 8 + 'px', screenWidth / 8 + 'px', screenWidth / 8 + 'px', screenWidth / 8 + 'px'];

    if (rootElement.myUserRole && rootElement.myUserRole.isPolice()) {
        var name = [];
        var display = [];
        for (var i = 0; i < that.lstAlarmTypeOjbect.length; i++) {
            if (that.lstAlarmTypeOjbect[i].isPolice) {
                name.push(that.lstAlarmTypeOjbect[i].armType);
                display.push(that.lstAlarmTypeOjbect[i].name);
            }
        }
        if (!displayLang) {
            displayLang = rootElement.lang.alarmPushConfig;
        }
        mod.push({
            title: {display: displayLang, pid: 0, pclass: 'clearfix', hide: false, tabshide: true},
            colgroup: {width: widths},
            tabs: {display: display, name: name}
        });
    } else {
        for (var i = 0; i < that.lstAlarmClassify.length; i++) {
            var subDisplay = [];
            var name = [];
            var display = [];
            subDisplay.push(that.lstAlarmClassify[i].name);
            for (var j = 0; j < that.lstAlarmTypeOjbect.length; j++) {
                if (that.lstAlarmTypeOjbect[j].isVehicle && that.lstAlarmTypeOjbect[j].classify == that.lstAlarmClassify[i].id) {
                    name.push(that.lstAlarmTypeOjbect[j].armType);
                    display.push(that.lstAlarmTypeOjbect[j].name);
                }
            }
            mod.push({
                title: {
                    display: subDisplay,
                    pid: that.lstAlarmClassify[i].id,
                    pclass: 'clearfix',
                    hide: false,
                    tabshide: true
                },
                colgroup: {width: widths},
                tabs: {display: display, name: name}
            });
        }
    }
    return mod;
},

    AlarmManager.prototype.initGroupModelWithKeyAndValue = function () {

        var mod = [];

        var that = this;

        if (rootElement.myUserRole && rootElement.myUserRole.isPolice()) {
            for (var i = 0; i < that.lstAlarmTypeOjbect.length; i++) {
                var subObjectList = [];
                if (that.lstAlarmTypeOjbect[i].isPolice) {
                    var subObject = {};
                    subObject.key = that.lstAlarmTypeOjbect[i].armType;
                    subObject.name = that.lstAlarmTypeOjbect[i].name;
                    subObjectList.push(subObject);
                }
            }
            mod.push({
                title: {
                    display: that.lstAlarmClassify[i].name,
                    pid: that.lstAlarmClassify[i].id,
                },
                tabs: subObjectList
            });
        } else {
            for (var i = 0; i < that.lstAlarmClassify.length; i++) {
                var subObjectList = [];
                for (var j = 0; j < that.lstAlarmTypeOjbect.length; j++) {
                    if (that.lstAlarmTypeOjbect[j].isVehicle && that.lstAlarmTypeOjbect[j].classify == that.lstAlarmClassify[i].id) {
                        var subObject = {};
                        subObject.key = that.lstAlarmTypeOjbect[j].armType;
                        subObject.name = that.lstAlarmTypeOjbect[j].name;
                        subObjectList.push(subObject);
                    }
                }
                mod.push({
                    title: {
                        display: that.lstAlarmClassify[i].name,
                        pid: that.lstAlarmClassify[i].id,
                    },
                    tabs: subObjectList
                });
            }
        }
        return mod;
    }

/**
 * 转成成报表下拉树数据形式
 */
AlarmManager.prototype.getSelectTreeData = function () {
    var alarmArr = [];
    alarmArr.push({
        checked: true,
        id: "all",
        name: rootElement.lang.selectAll,
        open: true,
        pId: 0
    })
    if (!this.lstAlarmTypeOjbect || this.lstAlarmTypeOjbect.length === 0) {
        return alarmArr;
    }
    var alarmParentObj = {};
    for (var i = 0; i < this.lstAlarmTypeOjbect.length; i++) {
        var alarmTypeOjbect = this.lstAlarmTypeOjbect[i];
        alarmTypeOjbect.checked = true;
        alarmTypeOjbect.open = true;
        alarmTypeOjbect.id = alarmTypeOjbect.armType;
        alarmTypeOjbect.pId = alarmTypeOjbect.parentName;

        alarmParentObj[alarmTypeOjbect.parentName] = alarmTypeOjbect.parentName;
    }

    var alarmParentArr = [];
    for (var alarmParentKey in alarmParentObj) {
        alarmParentArr.push({
            checked: true,
            id: alarmParentKey,
            name: alarmParentKey,
            open: true,
            pId: 0
        })
    }
    alarmArr = alarmArr.concat(alarmParentArr);
    alarmArr = alarmArr.concat(this.lstAlarmTypeOjbect);
    return alarmArr;
}


/**
 * 获取主动安全的报警(包含事件)
 * @returns {beginType，endType， classify}
 */
AlarmManager.prototype.getSafetyAlarmClass = function () {
    var that = this;
    // 所有报警都放进去
    var safetyAlarms = [];
    if (that.lstAlarmTypeOjbect && that.lstAlarmTypeOjbect.length > 0) {
        for (var i = 0; i < that.lstAlarmTypeOjbect.length; i++) {
            var classify = that.lstAlarmTypeOjbect[i].classify;
            if (classify == "activeSafetyZnjc" || classify == "activeSafetyFierce" ||
                classify == "activeSafetyProximity" || classify == "activeSafetyTmps" ||
                classify == "activeSafetyDsm" || classify == "activeSafetyAdas" || classify == "activeSafetySatellite" ||
                classify == "activeSafetyDriverIdentification" || classify == "activeSafetyVehicleOperationMonitoring" ||
                classify == "activeSafetyEquipmentFailureMonitoring" || classify == "safetyPlatformAlarm") {
                safetyAlarms.push({
                    beginType: that.lstAlarmTypeOjbect[i].armType,
                    endType: that.lstAlarmTypeOjbect[i].armEnd,
                    classify: classify
                });
            }
        }
    }
    return safetyAlarms;
}

AlarmManager.prototype.getAllArmTypeName = function () {
    var armTypes = {};
    this.lstAlarmTypeOjbect.forEach(function (item) {
        armTypes[item.id] = item.name;
    })
    return armTypes;
}

