function alarmTypeObject() {
    this.isPolice = false;	//police presence
    this.isVehicle = true;
    this.name = null;		//Alarm name
    this.parentName = null;//Alarm category name
    this.armType = null;	//Start alarm identification
    this.armEnd = null;//End alarm flag
    this.realType = null;//Reality ends when it exists, begins, ends
    this.classify = null;	//Used for classification within alarm shielding and alarm linkage
    this.isAlarmLinkage = false; //Is alarm linkage required?


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
 * Classification within alarm shielding and alarm linkage
 */
function AlarmManager() {
    this.lstAlarmTypeOjbect = [];//
    this.lst809AlarmTypeOjbect = [];//809 alarm classification
    this.lstAlarmClassify = [];//Classification type {id: corresponding identification, name: name}
    this.isAlarmLinkage = false; //Whether there is alarm linkage? If it is alarm linkage, several alarms need to be removed.
    this.isRemovePlatform = false; //Whether to remove platform alarm
    this.isRemoveSafety = false; //Whether to remove active safety
    this.allId = [];//all ids

    if (rootElement && typeof rootElement.getAlarmFilter == 'function') {
        this.alarmFilter = rootElement.getAlarmFilter();
    } else {
        this.alarmFilter = null;
    }
    this.isAlarmNoVehicle = false; //Special alarms are not stored according to vehicle ID.
    this.shieldArmType = [];//Alarms that need to be blocked
    this.langs = {
        "speendAlarm":rootElement.lang.over_speed_or_tired,
        "videoAlarm":rootElement.lang.monitor_alarm_video,
        "diskAlarm":rootElement.lang.monitor_alarm_disk,
        "faultAlarm":rootElement.lang.monitor_alarm_fault,
        "taxiAlarm":rootElement.lang.vehicle_Taxi,
        "operateAlarm":rootElement.lang.monitor_alarm_operate,
        "fuelAlarm":rootElement.lang.monitor_alarm_fuel,
        "otherAlarm":rootElement.lang.monitor_alarm_otherAlarm,
        "IOAlarm":rootElement.lang.alarm_type_io,
        "fenceAlarm":rootElement.lang.monitor_alarm_fence,
        "adasAlarm":rootElement.lang.monitor_alarm_adas,
        "platformAlarm":rootElement.lang.monitor_alarm_platform,
        "safetyPlatformAlarm":rootElement.lang.safety + "(" + rootElement.lang.platform + ")",
        "activeSafetyAdas":rootElement.lang.safetyAdas,
        "activeSafetyDsm":rootElement.lang.abnormality,
        "activeSafetyTmps":rootElement.lang.tmps,
        "activeSafetyProximity":rootElement.lang.proximity,
        "activeSafetyFierce":rootElement.lang.fierce_driving_type,
        "activeSafetyZnjc":rootElement.lang.znjc,
        "activeSafetySatellite":rootElement.lang.satellite_positioning_type,
        "activeSafetyDriverIdentification":rootElement.lang.driver_identification_event,
        "activeSafetyVehicleOperationMonitoring":rootElement.lang.vehicle_operation_monitoring,
        "activeSafetyEquipmentFailureMonitoring":rootElement.lang.equipment_failure_monitoring,
        "gSensor":rootElement.lang.alarm_GSensor_type,
        "loginAlarm":rootElement.lang.monitor_alarm_login,
        "government":rootElement.lang.manage_my_government,
        "customAlarm":rootElement.lang.alarm_name_1,
        "muckAlarm":rootElement.lang.muck_alarm,
        "lockAlarm":rootElement.lang.electronicLock,
        "activeSafetyOther":rootElement.lang.school_bus_alarm,
        "shanghai809Alarm":rootElement.lang.shanghai809,
        "decheng809Alarm":rootElement.lang.decheng809,
        "superiorPlatformAlarm":rootElement.lang.superior_platform_alarm,
        "activeSafetyActiveBraking":rootElement.lang.Active_braking,
        "monitorAlarmAbnormal":rootElement.lang.monitor_alarm_abnormal,
        "aiAlarm":rootElement.lang.ai_alarm,
        "securityAlarm":rootElement.lang.security_alarm,
        "tiredAlarm":rootElement.lang.fatigueAlarm,
        "offlineEarlyMorningAlarm":rootElement.lang.offline_early_morning_alarm
    }
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
//Get alarm type object collection
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
 * Multimedia upload matter encoding analysis
 */
AlarmManager.prototype.addMuckMediaEvent = function () {
    this.fillObject(rootElement.lang.alarm_name_138, rootElement.lang.monitor_alarm_otherAlarm, "138", "", "otherAlarm", false, true);//Illegal uninstallation
    this.fillObject(rootElement.lang.alarm_name_139, rootElement.lang.monitor_alarm_otherAlarm, "139", "", "otherAlarm", false, true);  //Heavy truck trunk lid is not closed
}


/**
 * Custom snapshot alarm
 */
AlarmManager.prototype.addMediaAlarm = function () {
    //When dealing with types, define an overload
    this.fillObject(rootElement.lang.alarm_name_9999, rootElement.lang.monitor_alarm_otherAlarm, "9999", "", "otherAlarm", false, true);   //1
}

/**
 * New alarm for black mark
 */
AlarmManager.prototype.addHeiLongJiangAlarm = function () {
    //driver identification

    this.fillObject(rootElement.lang.alarm_name_511, rootElement.lang.driver_identification_event, "511", "561", "activeSafetyDriverIdentification", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_699, rootElement.lang.driver_identification_event, "699", null, "activeSafetyDriverIdentification", false, true);   //1
/******************Mobile Driver Identification Alarm************************/
    this.fillObject(rootElement.lang.alarm_name_643, rootElement.lang.driver_identification_event, "643", null, "activeSafetyDriverIdentification", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_697, rootElement.lang.driver_identification_event, "697", null, "activeSafetyDriverIdentification", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_698, rootElement.lang.driver_identification_event, "698", null, "activeSafetyDriverIdentification", false, true);	//1
    //DSM Jibiao/
    this.fillObject(rootElement.lang.alarm_name_646, rootElement.lang.driver_identification_event, "646", null, "activeSafetyDriverIdentification", false, true);	//1
    //Inspection comparison and identification reporting event
    this.fillObject(rootElement.lang.alarm_name_647, rootElement.lang.driver_identification_event, "647", null, "activeSafetyDriverIdentification", false, true);	//1
    //Ignition comparison identification reporting event
    this.fillObject(rootElement.lang.alarm_name_648, rootElement.lang.driver_identification_event, "648", null, "activeSafetyDriverIdentification", false, true);	//1
    //Leave and return to the identification reporting event
    this.fillObject(rootElement.lang.alarm_name_649, rootElement.lang.driver_identification_event, "649", null, "activeSafetyDriverIdentification", false, true);	//1
    //Driver Identification Event (Platform)
    this.fillObject(rootElement.lang.alarm_name_636, rootElement.lang.driver_identification_event, "636", null, "activeSafetyDriverIdentification", false, true);	//1
    //Dynamic job search (platform)
    this.fillObject(rootElement.lang.alarm_name_686, rootElement.lang.driver_identification_event, "686", null, "activeSafetyDriverIdentification", false, true);	//1
    //driver identification event
    this.fillObject(rootElement.lang.alarm_name_696, rootElement.lang.driver_identification_event, "696", null, "activeSafetyDriverIdentification", false, true);	//1
    //Call the police if the witness’s evidence does not match (Platform)
    this.fillObject(rootElement.lang.alarm_name_664, rootElement.lang.driver_identification_event, "664", null, "activeSafetyDriverIdentification", false, true);	//1


    //Vehicle operation monitoring
    //this.fillObject("Forward Collision Warning", rootElement.lang.monitor_alarm_otherAlarm, "600", "", "otherAlarm", false, true);
    //this.fillObject("Forward Collision Alarm", rootElement.lang.monitor_alarm_otherAlarm, "601", "", "otherAlarm", false, true);
    //this.fillObject("Lane Departure Warning", rootElement.lang.monitor_alarm_otherAlarm, "602", "", "otherAlarm", false, true);
    //this.fillObject("Lane Departure Alarm", rootElement.lang.monitor_alarm_otherAlarm, "603", "", "otherAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_512, rootElement.lang.vehicle_operation_monitoring, "512", "562", "activeSafetyVehicleOperationMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_513, rootElement.lang.vehicle_operation_monitoring, "513", "563", "activeSafetyVehicleOperationMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_514, rootElement.lang.vehicle_operation_monitoring, "514", "564", "activeSafetyVehicleOperationMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_515, rootElement.lang.vehicle_operation_monitoring, "515", "565", "activeSafetyVehicleOperationMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_523, rootElement.lang.vehicle_operation_monitoring, "523", "573", "activeSafetyVehicleOperationMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_524, rootElement.lang.vehicle_operation_monitoring, "524", "574", "activeSafetyVehicleOperationMonitoring", false, true);   //1
    //Driver driving behavior monitoring
    //this.fillObject("Fatigue driving warning", rootElement.lang.monitor_alarm_otherAlarm, "618", "", "otherAlarm", false, true);
    //this.fillObject("Fatigue Driving Alarm", rootElement.lang.monitor_alarm_otherAlarm, "619", "", "otherAlarm", false, true);
    //this.fillObject("Handheld to make and receive calls to alarm", rootElement.lang.monitor_alarm_otherAlarm, "621", "", "otherAlarm", false, true);
    //this.fillObject("Alarm without looking ahead for a long time", rootElement.lang.monitor_alarm_otherAlarm, "703", "", "otherAlarm", false, true);
    //this.fillObject("Alarm when the driver is not in the driving position", rootElement.lang.monitor_alarm_otherAlarm, "709", "", "otherAlarm", false, true);
    //this.fillObject("Smoking Alarm", rootElement.lang.monitor_alarm_otherAlarm, "623", "", "otherAlarm", false, true);
    //Equipment failure monitoring
    //this.fillObject("Occlusion failure alarm", rootElement.lang.monitor_alarm_otherAlarm, "735", "", "otherAlarm", false, true);
    //this.fillObject("Infrared blocking sunglasses failure alarm", rootElement.lang.monitor_alarm_otherAlarm, "640", "", "otherAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_516, rootElement.lang.equipment_failure_monitoring, "516", "566", "activeSafetyEquipmentFailureMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_517, rootElement.lang.equipment_failure_monitoring, "517", "567", "activeSafetyEquipmentFailureMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_518, rootElement.lang.equipment_failure_monitoring, "518", "568", "activeSafetyEquipmentFailureMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_519, rootElement.lang.equipment_failure_monitoring, "519", "569", "activeSafetyEquipmentFailureMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_520, rootElement.lang.equipment_failure_monitoring, "520", "570", "activeSafetyEquipmentFailureMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_521, rootElement.lang.equipment_failure_monitoring, "521", "571", "activeSafetyEquipmentFailureMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_522, rootElement.lang.equipment_failure_monitoring, "522", "572", "activeSafetyEquipmentFailureMonitoring", false, true);   //1
}

/**
 * Hunan (Xiangbiao) new alarm
 */
AlarmManager.prototype.addHuNanAlarm = function () {
    //Xiangbiao
    // Dsm
    this.fillObject(rootElement.lang.alarm_name_525 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "525", "575", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_525 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "541", "591", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_526, rootElement.lang.abnormality, "526", "576", "activeSafetyDsm", false, true); //1
    //Intelligent detection
    this.fillObject(rootElement.lang.alarm_name_527, rootElement.lang.znjc, "527", "577", "activeSafetyZnjc", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_528, rootElement.lang.znjc, "528", "578", "activeSafetyZnjc", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_529, rootElement.lang.znjc, "529", "579", "activeSafetyZnjc", false, true);	//1
}


/**
 * Wine test data custom development
 */
AlarmManager.prototype.addWineTestAlarm = function () {
    // Dsm
    //Alcohol test is normal
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
 * Active Safety (Shanghai) adds new alarm
 */
AlarmManager.prototype.addShangHaiAlarm = function () {
    //Front approach alarm
    this.fillObject(rootElement.lang.alarm_name_1444, rootElement.lang.proximity, "1444", null, "activeSafetyProximity", false, true);	//1
    //Turn right without stopping or there is not enough parking time
    this.fillObject(rootElement.lang.alarm_name_1445, rootElement.lang.proximity, "1445", null, "activeSafetyProximity", false, true);	//1
    
    this.fillObject(rootElement.lang.alarm_name_1603, rootElement.lang.proximity, "1603", null, "activeSafetyProximity", false, true);
    this.fillObject(rootElement.lang.alarm_name_1604, rootElement.lang.proximity, "1604", null, "activeSafetyProximity", false, true);

    this.fillObject(rootElement.lang.alarm_name_1600, rootElement.lang.Active_braking, "1600", null, "activeSafetyActiveBraking", false, true);
    this.fillObject(rootElement.lang.alarm_name_1601, rootElement.lang.Active_braking, "1601", null, "activeSafetyActiveBraking", false, true);
    this.fillObject(rootElement.lang.alarm_name_1602, rootElement.lang.Active_braking, "1602", null, "activeSafetyActiveBraking", false, true);
    this.fillObject(rootElement.lang.alarm_name_1605, rootElement.lang.Active_braking, "1605", null, "activeSafetyActiveBraking", false, true);
    
    
}
/**
 * Active Security (Sichuan) adds new alarm
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


    //Intelligent detection
    //New alarms added in Sichuan Standard 2021
    //#define GPS_ALARM_TYPE_SB_EXCEEDING_ROAD_LOAD     545
    //#define GPS_ALARM_TYPE_SB_EXCEEDING_VEHICLE_LOAD  549
    //#define NET_ALARM_TYPE_SB_EXCEEDING_GAODE         1237
    this.fillObject(rootElement.lang.alarm_name_545, rootElement.lang.znjc, "545", "595", "activeSafetyZnjc", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_549, rootElement.lang.znjc, "549", "599", "activeSafetyZnjc", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1237, rootElement.lang.znjc, "1237", "1287", "activeSafetyZnjc", false, true);	//1
    // DSM
    //#define NET_ALARM_TYPE_SB_L1_NIGHT_DRIVING_BAN          1238
    //#define NET_ALARM_TYPE_SB_L2_NIGHT_DRIVING_BAN          1239
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
 * Active Safety (Beijing) adds new alarm
 */
AlarmManager.prototype.addBeiJingAlarm = function () {
    //Beijing
    //1434
    this.fillObject(rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_33333, rootElement.lang.abnormality, "1434", "1484", "activeSafetyDsm", false, true);	//1
    //1435
    this.fillObject(rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_33333, rootElement.lang.abnormality, "1435", "1485", "activeSafetyDsm", false, true);	//1
    //Fatigue driving alarm level 3
    this.fillObject(rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_33333, rootElement.lang.abnormality, "1200", "1250", "activeSafetyDsm", false, true);	//1
    //Distracted driving alarm level 3
    this.fillObject(rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_33333, rootElement.lang.abnormality, "1201", "1251", "activeSafetyDsm", false, true);	//1
    //Smoking Level 3
    this.fillObject(rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_33333, rootElement.lang.abnormality, "1202", "1252", "activeSafetyDsm", false, true);	//1
    //Call the police Level 3
    this.fillObject(rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_33333, rootElement.lang.abnormality, "1203", "1253", "activeSafetyDsm", false, true);	//1
    //Level 3 alarm occurs when the driver takes his hands off the steering wheel
    this.fillObject(rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_33333, rootElement.lang.abnormality, "1204", "1254", "activeSafetyDsm", false, true);	//1
    //Level 3 alarm for driver not wearing seat belt
    this.fillObject(rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_33333, rootElement.lang.abnormality, "1205", "1255", "activeSafetyDsm", false, true);	//1
    //Driver abnormality alarm level 3
    this.fillObject(rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_33333, rootElement.lang.abnormality, "1206", "1256", "activeSafetyDsm", false, true);	//1
    //Report discrepancy to the police level 1
    this.fillObject(rootElement.lang.alarm_name_510 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "510", "560", "activeSafetyDsm", false, true);   //1
    //Report discrepancy between witnesses and witnesses, level 2
    this.fillObject(rootElement.lang.alarm_name_510 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "1447", "1497", "activeSafetyDsm", false, true);   //1
    //If the witnesses and evidence do not match, call the police Level 3
    this.fillObject(rootElement.lang.alarm_name_510 + rootElement.lang.alarm_name_33333, rootElement.lang.abnormality, "1448", "1498", "activeSafetyDsm", false, true);   //1
    //Forward collision warning level 3
    this.fillObject(rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_33333, rootElement.lang.safetyAdas, "1207", "1257", "activeSafetyAdas", false, true); //1
    //Alarm level 3 when the vehicle is too close
    this.fillObject(rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_33333, rootElement.lang.safetyAdas, "1208", "1258", "activeSafetyAdas", false, true);	//1
    //Lane departure warning level 3
    this.fillObject(rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_33333, rootElement.lang.safetyAdas, "1209", "1259", "activeSafetyAdas", false, true);	//1
    //Pedestrian Collision Alarm Level 3
    this.fillObject(rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_33333, rootElement.lang.safetyAdas, "1210", "1260", "activeSafetyAdas", false, true);	//1
    //Northern Standard
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
    this.fillObject(rootElement.lang.alarm_name_1211 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "1211", "1261", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_1211 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "1212", "1262", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_1211 + rootElement.lang.alarm_name_33333, rootElement.lang.safetyAdas, "1213", "1263", "activeSafetyAdas", false, true);
}

/**
 * Active safety other alarms
 */
AlarmManager.prototype.addSchoolAlarm = function(){
    this.fillObject(rootElement.lang.alarm_name_1428, rootElement.lang.school_bus_alarm, "1428", "1478", "activeSafetyOther", false, true);
    this.fillObject(rootElement.lang.alarm_name_1433, rootElement.lang.school_bus_alarm, "1433", "1483", "activeSafetyOther", false, true);
    this.fillObject(rootElement.lang.alarm_name_1436, rootElement.lang.school_bus_alarm, "1436", "1486", "activeSafetyOther", false, true);
    this.fillObject(rootElement.lang.alarm_name_1437, rootElement.lang.school_bus_alarm, "1437", "1487", "activeSafetyOther", false, true);
    this.fillObject(rootElement.lang.alarm_name_1438, rootElement.lang.school_bus_alarm, "1438", "1488", "activeSafetyOther", false, true);
    this.fillObject(rootElement.lang.alarm_name_1446, rootElement.lang.school_bus_alarm, "1446", "1496", "activeSafetyOther", false, true);
}
/**
 * New alarm for active safety alarm of muck truck
 * @param type 1 common type
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
 * Jiangsu active security alarm adds new alarm
 */
AlarmManager.prototype.addJiangSuAlarm = function () {
    // BSD
    this.fillObject(rootElement.lang.alarm_name_1432, rootElement.lang.proximity, "1432", "1482", "activeSafetyProximity", false, true); //1
}


/**
 * 809 alarm initialization data information
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
 * @param alarmType Alarm type 10 G-SenSor 9 Active safety 3 AI alarm 2 Daily report related alarm 1 Waste truck
 * isAccessory attachment acquisition function
 *
 *
 */
AlarmManager.prototype.initObject = function (alarmType, hideEvent, isAccessory) {
    //Track playback displays the alarm list identified by the map
    if (alarmType === 'trackBackShowMap') {
        this.addTrackBackShowMap();
        return;
    }
    //Alarm shielding or alarm linkage; undefined status bit alarm, no recording
    //Add some shielding of alarm status bits, and there is no alarm. No alarm linkage
    if (alarmType === 'AlarmMaskLinkage') {
       // this.fillObject(rootElement.lang.alarm_type_no_record, rootElement.lang.monitor_alarm_otherAlarm, "-100", "", "otherAlarm", false, true);   //1
       // this.fillObject(rootElement.lang.alarm_name_1433, rootElement.lang.monitor_alarm_otherAlarm, "1433", "1483", "otherAlarm", false, true);
      //  this.fillObject(rootElement.lang.alarm_name_1436, rootElement.lang.monitor_alarm_otherAlarm, "1436", "1486", "otherAlarm", false, true);
       // this.fillObject(rootElement.lang.alarm_name_1437, rootElement.lang.monitor_alarm_otherAlarm, "1437", "1487", "otherAlarm", false, true);
       // this.fillObject(rootElement.lang.alarm_name_1438, rootElement.lang.monitor_alarm_otherAlarm, "1438", "1488", "otherAlarm", false, true);
       // this.fillObject(rootElement.lang.alarm_name_1446, rootElement.lang.monitor_alarm_otherAlarm, "1446", "1496", "otherAlarm", false, true);
    }
    //Comes with statistics in daily reports
    if (alarmType === 'dailySummary') {
        this.addDailySummary();
        return;
    }
    //The statistical alarm type in the daily report is consistent with the AlarmSum and SafeAlarmSum fields.
    if (alarmType === 'dailySummaryEx') {
        this.addDailySummaryEx();
        return;
    }
    //Shanghai 809 alarm or NingXieDeCheng 809 alarm
    if (alarmType === 13) {
        this.addAlarmTypeBy13();
        return;
    }
    if (alarmType === 12) {
        this.addAlarmTypeBy12();
        return;
    }

    //G-sensor alarm type
    if (alarmType === 11) {
        this.addAlarmTypeBy11();
        return;
    }

    //Secondary alarm related alarm rules loading alarm type
    //Contains secondary alarm
    if (alarmType === 9) {
        this.addAlarmTypeBy9();
        return;
    }

    //active safety equipment
    //Rear approach alarm
    if (alarmType === 3) {
        this.addAlarmTypeBy3(hideEvent)
        return;
    }
    // 
    if (alarmType == 'wisdomScreenAlarm') {
        this.addWisdomScreenAlarm();
        return;
    }
    if (alarmType === 2) {//Used for statistical data corresponding to daily report alarms
        this.addAlarmTypeBy2();
        return;
    }

    //The garbage truck query page obtains alarm information.
    if (alarmType === 1) {
        this.addAlarmTypeBy1();
    }
    if (alarmType === 10) { //Alarm push settings require customized alarms such as inspection and supervision. Subiao alarm attachment upload completion notification event
        this.addAlarmTypeBy10();
    }
    if (alarmType == 'custom') {
        this.addAlarmTypeByCustom();
    }

    this.addAlarmTypeByAll(hideEvent);

    if(alarmType == 'alarmShield'){
        this.fillObject(rootElement.lang.alarm_type_no_record, rootElement.lang.monitor_alarm_otherAlarm, "-100", "", "otherAlarm", false, true);
    }

}


/**
 * Added electronic lock alarm
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
 * (Shanghai 809) New alarm
 * Ningxia Decheng 809 alarm
 */
AlarmManager.prototype.addShangHaiOrDecheng809Alarm = function () {
    this.fillObject(rootElement.lang.alarm_name_2051, rootElement.lang.superior_platform_alarm, "2051", "2101", "superiorPlatformAlarm", false, true);//Overspeed alarm (dangerous transport, passenger transport) param[0]alarm ID
    this.fillObject(rootElement.lang.alarm_name_2052, rootElement.lang.superior_platform_alarm, "2052", "2102", "superiorPlatformAlarm", false, true);//Fatigue driving alarm (dangerous transport, passenger transport) param[0]alarm ID
    this.fillObject(rootElement.lang.alarm_name_2053, rootElement.lang.superior_platform_alarm, "2053", "2103", "superiorPlatformAlarm", false, true);//2-5 o'clock operation alarm (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2054, rootElement.lang.superior_platform_alarm, "2054", "2104", "superiorPlatformAlarm", false, true);//Illegal departure (passenger transport, chartered bus within the city) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2055, rootElement.lang.superior_platform_alarm, "2055", "2105", "superiorPlatformAlarm", false, true);//Unlicensed entry and exit (passenger travel charter) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2056, rootElement.lang.superior_platform_alarm, "2056", "2106", "superiorPlatformAlarm", false, true);//Multiple entry and exit (passenger travel charter) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2057, rootElement.lang.superior_platform_alarm, "2057", "2107", "superiorPlatformAlarm", false, true);//The origin and destination are more than 800 kilometers (passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2058, rootElement.lang.superior_platform_alarm, "2058", "2108", "superiorPlatformAlarm", false, true);//Forbidden area (passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2059, rootElement.lang.superior_platform_alarm, "2059", "2109", "superiorPlatformAlarm", false, true);//Entry at non-designated crossings (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2060, rootElement.lang.superior_platform_alarm, "2060", "2110", "superiorPlatformAlarm", false, true);//Exit at non-designated crossing (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2061, rootElement.lang.superior_platform_alarm, "2061", "2111", "superiorPlatformAlarm", false, true);//Abnormal disconnection (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2062, rootElement.lang.superior_platform_alarm, "2062", "2112", "superiorPlatformAlarm", false, true);//Abnormal online (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2063, rootElement.lang.superior_platform_alarm, "2063", "2113", "superiorPlatformAlarm", false, true);//Yangpu Bridge traffic restriction alarm (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2064, rootElement.lang.superior_platform_alarm, "2064", "2114", "superiorPlatformAlarm", false, true);//Early warning for incident handling of vehicles that should be stopped (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2065, rootElement.lang.superior_platform_alarm, "2065", "2115", "superiorPlatformAlarm", false, true);//Offline offset warning (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2066, rootElement.lang.superior_platform_alarm, "2066", "2116", "superiorPlatformAlarm", false, true);//Vehicle offline warning (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2067, rootElement.lang.superior_platform_alarm, "2067", "2117", "superiorPlatformAlarm", false, true);//The waybill was not submitted and the vehicle was not shipped (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2068, rootElement.lang.superior_platform_alarm, "2068", "2118", "superiorPlatformAlarm", false, true);//There is a track but no waybill (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2069, rootElement.lang.superior_platform_alarm, "2069", "2119", "superiorPlatformAlarm", false, true);//There is a waybill but no track (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2070, rootElement.lang.superior_platform_alarm, "2070", "2120", "superiorPlatformAlarm", false, true);//Not carrying waybill with the vehicle (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2071, rootElement.lang.superior_platform_alarm, "2071", "2121", "superiorPlatformAlarm", false, true);//The loading place does not match the waybill (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2072, rootElement.lang.superior_platform_alarm, "2072", "2122", "superiorPlatformAlarm", false, true);//The unloading place does not match the waybill (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2073, rootElement.lang.superior_platform_alarm, "2073", "2123", "superiorPlatformAlarm", false, true);//Heavy vehicle parking (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2074, rootElement.lang.superior_platform_alarm, "2074", "2124", "superiorPlatformAlarm", false, true);//Empty off-site parking (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2075, rootElement.lang.superior_platform_alarm, "2075", "2125", "superiorPlatformAlarm", false, true);//Emergency alarm (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2076, rootElement.lang.superior_platform_alarm, "2076", "2126", "superiorPlatformAlarm", false, true);//Enter the designated area alarm (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2077, rootElement.lang.superior_platform_alarm, "2077", "2127", "superiorPlatformAlarm", false, true);//Alarm for leaving the designated area (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2078, rootElement.lang.superior_platform_alarm, "2078", "2128", "superiorPlatformAlarm", false, true);//Road section congestion alarm (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2079, rootElement.lang.superior_platform_alarm, "2079", "2129", "superiorPlatformAlarm", false, true);//Dangerous road section alarm (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2080, rootElement.lang.superior_platform_alarm, "2080", "2130", "superiorPlatformAlarm", false, true);//Cross-border alarm (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2081, rootElement.lang.superior_platform_alarm, "2081", "2131", "superiorPlatformAlarm", false, true);//Burglary alarm (dangerous transport, passenger transport) param[0]alarm ID
    this.fillObject(rootElement.lang.alarm_name_2082, rootElement.lang.superior_platform_alarm, "2082", "2132", "superiorPlatformAlarm", false, true);//Robbery police (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2083, rootElement.lang.superior_platform_alarm, "2083", "2133", "superiorPlatformAlarm", false, true);//Departure route alarm (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2084, rootElement.lang.superior_platform_alarm, "2084", "2134", "superiorPlatformAlarm", false, true);//Vehicle movement alarm (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2085, rootElement.lang.superior_platform_alarm, "2085", "2135", "superiorPlatformAlarm", false, true);//Overtime driving alarm (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2086, rootElement.lang.superior_platform_alarm, "2086", "2136", "superiorPlatformAlarm", false, true);//Others (dangerous transport, passenger transport) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2087, rootElement.lang.superior_platform_alarm, "2087", "2137", "superiorPlatformAlarm", false, true);// Answer a call param[0]Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2088, rootElement.lang.superior_platform_alarm, "2088", "2138", "superiorPlatformAlarm", false, true);// Smoking alarm param[0]Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2089, rootElement.lang.superior_platform_alarm, "2089", "2139", "superiorPlatformAlarm", false, true);// Distraction alarm param[0]Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2090, rootElement.lang.superior_platform_alarm, "2090", "2140", "superiorPlatformAlarm", false, true);// Driver abnormality alarm param[0]Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2091, rootElement.lang.superior_platform_alarm, "2091", "2141", "superiorPlatformAlarm", false, true);// Collision alarm param[0]Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2092, rootElement.lang.superior_platform_alarm, "2092", "2142", "superiorPlatformAlarm", false, true);// Frequent lane changes param[0]Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2093, rootElement.lang.superior_platform_alarm, "2093", "2143", "superiorPlatformAlarm", false, true);// Tire pressure alarm param[0]Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2094, rootElement.lang.superior_platform_alarm, "2094", "2144", "superiorPlatformAlarm", false, true);// Rollover alarm param[0]Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2095, rootElement.lang.superior_platform_alarm, "2095", "2145", "superiorPlatformAlarm", false, true);// Forward collision warning param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2096, rootElement.lang.superior_platform_alarm, "2096", "2146", "superiorPlatformAlarm", false, true);// Lane departure warning param[0]Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2097, rootElement.lang.superior_platform_alarm, "2097", "2147", "superiorPlatformAlarm", false, true);// Vehicle too close warning param[0]Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2098, rootElement.lang.superior_platform_alarm, "2098", "2148", "superiorPlatformAlarm", false, true);// Pedestrian collision warning param[0]Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2099, rootElement.lang.superior_platform_alarm, "2099", "2149", "superiorPlatformAlarm", false, true);// Fatigue driving param[0]alarm ID
    this.fillObject(rootElement.lang.alarm_name_2100, rootElement.lang.superior_platform_alarm, "2100", "2150", "superiorPlatformAlarm", false, true);// Distracted driving alarm param[0]Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2151, rootElement.lang.superior_platform_alarm, "2151", "2201", "superiorPlatformAlarm", false, true);// Driver identity authentication alarm param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2152, rootElement.lang.superior_platform_alarm, "2152", "2202", "superiorPlatformAlarm", false, true);// Blind spot detection alarm (rear proximity alarm) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2153, rootElement.lang.superior_platform_alarm, "2153", "2203", "superiorPlatformAlarm", false, true);// Blind spot detection alarm (left rear proximity alarm) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2154, rootElement.lang.superior_platform_alarm, "2154", "2204", "superiorPlatformAlarm", false, true);// Blind spot detection alarm (right rear proximity alarm) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2155, rootElement.lang.superior_platform_alarm, "2155", "2205", "superiorPlatformAlarm", false, true);// Abnormal tire pressure alarm (tire pressure is reported regularly) param[0] Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2156, rootElement.lang.superior_platform_alarm, "2156", "2206", "superiorPlatformAlarm", false, true);// Abnormal tire pressure alarm (excessive tire pressure alarm) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2157, rootElement.lang.superior_platform_alarm, "2157", "2207", "superiorPlatformAlarm", false, true);// Abnormal tire pressure alarm (low tire pressure alarm) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2158, rootElement.lang.superior_platform_alarm, "2158", "2208", "superiorPlatformAlarm", false, true);// Abnormal tire pressure alarm (excessive tire temperature alarm) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2159, rootElement.lang.superior_platform_alarm, "2159", "2209", "superiorPlatformAlarm", false, true);// Abnormal tire pressure alarm (sensor abnormal alarm) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2160, rootElement.lang.superior_platform_alarm, "2160", "2210", "superiorPlatformAlarm", false, true);// Abnormal tire pressure alarm (tire pressure imbalance alarm) param[0] Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2161, rootElement.lang.superior_platform_alarm, "2161", "2211", "superiorPlatformAlarm", false, true);// Abnormal tire pressure alarm (slow air leakage alarm) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2162, rootElement.lang.superior_platform_alarm, "2162", "2212", "superiorPlatformAlarm", false, true);// Abnormal tire pressure alarm (low battery alarm) param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2163, rootElement.lang.superior_platform_alarm, "2163", "2213", "superiorPlatformAlarm", false, true);// Frequent lane change warning param[0]Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2164, rootElement.lang.superior_platform_alarm, "2164", "2214", "superiorPlatformAlarm", false, true);// Emergency braking param[0]Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2165, rootElement.lang.superior_platform_alarm, "2165", "2215", "superiorPlatformAlarm", false, true);// Idle stop param[0]alarm ID
    this.fillObject(rootElement.lang.alarm_name_2166, rootElement.lang.superior_platform_alarm, "2166", "2216", "superiorPlatformAlarm", false, true);// Low gear and high speed param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2167, rootElement.lang.superior_platform_alarm, "2167", "2217", "superiorPlatformAlarm", false, true);// Coasting in neutral param[0]Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2169, rootElement.lang.superior_platform_alarm, "2169", "2219", "superiorPlatformAlarm", false, true);// Long-term remote operation alarm param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2170, rootElement.lang.superior_platform_alarm, "2170", "2220", "superiorPlatformAlarm", false, true);// Timeout fatigue driving alarm param[0]Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2171, rootElement.lang.superior_platform_alarm, "2171", "2221", "superiorPlatformAlarm", false, true);// Cumulative driving timeout alarm param[0]Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2172, rootElement.lang.superior_platform_alarm, "2172", "2222", "superiorPlatformAlarm", false, true);// Illegal vehicle displacement param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2173, rootElement.lang.superior_platform_alarm, "2173", "2223", "superiorPlatformAlarm", false, true);// The vehicle has not been online for more than three days param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2174, rootElement.lang.superior_platform_alarm, "2174", "2224", "superiorPlatformAlarm", false, true);// Driver active alarm param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2175, rootElement.lang.superior_platform_alarm, "2175", "2225", "superiorPlatformAlarm", false, true);// Insufficient section driving time param[0]Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2176, rootElement.lang.superior_platform_alarm, "2176", "2226", "superiorPlatformAlarm", false, true);// Driver active alarm param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2177, rootElement.lang.superior_platform_alarm, "2177", "2227", "superiorPlatformAlarm", false, true);// Electronic fence param[0]alarm ID
    this.fillObject(rootElement.lang.alarm_name_2178, rootElement.lang.superior_platform_alarm, "2178", "2228", "superiorPlatformAlarm", false, true);// Storage unit fault alarm param[0]Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2179, rootElement.lang.superior_platform_alarm, "2179", "2229", "superiorPlatformAlarm", false, true);// GNSS module fails param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2180, rootElement.lang.superior_platform_alarm, "2180", "2230", "superiorPlatformAlarm", false, true);// GNSS antenna is not connected or cut off param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2181, rootElement.lang.superior_platform_alarm, "2181", "2231", "superiorPlatformAlarm", false, true);// GNSS antenna short circuit param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2182, rootElement.lang.superior_platform_alarm, "2182", "2232", "superiorPlatformAlarm", false, true);// Terminal main power undervoltage param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2183, rootElement.lang.superior_platform_alarm, "2183", "2233", "superiorPlatformAlarm", false, true);// Terminal main power supply fails param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2184, rootElement.lang.superior_platform_alarm, "2184", "2234", "superiorPlatformAlarm", false, true);// Terminal LCD or display failure param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2185, rootElement.lang.superior_platform_alarm, "2185", "2235", "superiorPlatformAlarm", false, true);// TTS module fault param[0]alarm ID
    this.fillObject(rootElement.lang.alarm_name_2186, rootElement.lang.superior_platform_alarm, "2186", "2236", "superiorPlatformAlarm", false, true);// Camera failure param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2187, rootElement.lang.superior_platform_alarm, "2187", "2237", "superiorPlatformAlarm", false, true);// Vehicle VSS fault param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2188, rootElement.lang.superior_platform_alarm, "2188", "2238", "superiorPlatformAlarm", false, true);// Abnormal vehicle fuel level param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2189, rootElement.lang.superior_platform_alarm, "2189", "2239", "superiorPlatformAlarm", false, true);// Road transport certificate IC card module failure param[0] alarm ID
    this.fillObject(rootElement.lang.alarm_name_2190, rootElement.lang.superior_platform_alarm, "2190", "2240", "superiorPlatformAlarm", false, true);// Timeout parking alarm param[0]Alarm ID
    this.fillObject(rootElement.lang.alarm_name_2191, rootElement.lang.superior_platform_alarm, "2191", "2241", "superiorPlatformAlarm", false, true);// Identity authentication failure event param[0] alarm ID
}


/**
 * Alarm initialization data information
 * @param name alarm name
 * @param parentName Alarm parent node name used for linkage
 * @param armType alarm start identifier
 * @param armEnd alarm end identifier
 * @param classify alarm classification
 * @param isPolice Whether the police type
 * @param isAlarmLinkage Whether the type required for alarm linkage
 */
AlarmManager.prototype.fillObject = function (name, parentName, armType, armEnd, classify, isPolice, isAlarmLinkage) {

    if(this.shieldArmType.length > 0 && this.shieldArmType.contains(armType)){
        return;
    }

    //If it is alarm linkage, you only need to load the required alarm type
    if ((this.isAlarmLinkage && isAlarmLinkage) || !this.isAlarmLinkage) {

        if (armType == '6321' || armType == '6322' || armType == '6323') {
            //These three alarms are not filtered
        } else if (this.alarmFilter) {
            if (classify == "activeSafetyZnjc" || classify == "activeSafetyFierce" ||
                classify == "activeSafetyProximity" || classify == "activeSafetyTmps" ||
                classify == "activeSafetyDsm" || classify == "activeSafetyAdas" || classify == "activeSafetySatellite" ||
                classify == "activeSafetyDriverIdentification" || classify == "activeSafetyVehicleOperationMonitoring" ||
                classify == "activeSafetyEquipmentFailureMonitoring" || classify == "activeSafetyOther") {
                //Prioritize using the main class (maximum length is 6) indexOf
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
 * Added black car alarm
 */
AlarmManager.prototype.addBlackVehicleAlarm = function () {
    //Black car alarm
    this.fillObject(rootElement.lang.alarm_name_530 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "530", "580", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_530 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "531", "581", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_532 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "532", "582", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_532 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "533", "583", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_534 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "534", "584", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_534 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "535", "585", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_536 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "536", "586", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_536 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "537", "587", "activeSafetyAdas", false, true);
}

AlarmManager.prototype.addTrackBackShowMap = function () {
    //Drowsy driving 49
    this.fillObject(rootElement.lang.alarm_name_49, rootElement.lang.fatigueAlarm, "49", "99", "tiredAlarm", false, true);    //1
    //Fatigue driving warning
    this.fillObject(rootElement.lang.alarm_name_429, rootElement.lang.fatigueAlarm, "429", "479", "tiredAlarm", false, true);
    //Speed ​​alarm 11
    this.fillObject(rootElement.lang.alarm_name_11, rootElement.lang.over_speed_alarm, "11", "61", "speendAlarm", false, true);    //1
    //TODO police statistics
    this.fillObject(rootElement.lang.alarm_name_428, rootElement.lang.over_speed_alarm, "428", "478", "speendAlarm", false, true);	//1
    //Entry and exit area 211
    this.fillObject(rootElement.lang.alarm_name_211, rootElement.lang.monitor_alarm_fence, "211", "261", "fenceAlarm", true, true);   //1
}


AlarmManager.prototype.addAlarmTypeBy13 = function () {
    if (rootElement.myUserRole && (rootElement.myUserRole.isEnableShangHai809() || rootElement.myUserRole.isEnableDeCheng809())){
        this.addShangHaiOrDecheng809Alarm();
    }
}

AlarmManager.prototype.addAlarmTypeBy12 = function () {
//Forward
    this.fillObject(rootElement.lang.alarm_name_1000, rootElement.lang.monitor_alarm_otherAlarm, "1000", "1050", "otherAlarm", false, true);
    //reverse
    this.fillObject(rootElement.lang.alarm_name_1001, rootElement.lang.monitor_alarm_otherAlarm, "1001", "1051", "otherAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1030, rootElement.lang.monitor_alarm_otherAlarm, "1030", "1080", "otherAlarm", false, true);
}

AlarmManager.prototype.addAlarmTypeBy11 = function () {
    //GSensor starts
    this.fillObject(rootElement.lang.alarm_name_439, rootElement.lang.alarm_GSensor_type, "439", "489", "gSensor", false, true);
    //GSensorStop
    this.fillObject(rootElement.lang.alarm_name_440, rootElement.lang.alarm_GSensor_type, "440", "490", "gSensor", false, true);
    //Rapid acceleration
    this.fillObject(rootElement.lang.alarm_name_246, rootElement.lang.monitor_alarm_otherAlarm, "246", "296", "otherAlarm", false, true);
    //Rapid deceleration
    this.fillObject(rootElement.lang.alarm_name_247, rootElement.lang.monitor_alarm_otherAlarm, "247", "297", "otherAlarm", false, true);
    //sharp turn
    this.fillObject(rootElement.lang.alarm_name_444, rootElement.lang.alarm_GSensor_type, "444", "494", "gSensor", false, true);
    //Collision and rollover alarm
    this.fillObject(rootElement.lang.alarm_name_219, rootElement.lang.alarm_GSensor_type, "219", "269", "gSensor", false, true);
    //GSensor rollover
    this.fillObject(rootElement.lang.alarm_name_441, rootElement.lang.alarm_GSensor_type, "441", "491", "gSensor", false, true);
}

AlarmManager.prototype.addAlarmTypeBy9 = function () {
    //further subdivided
    //adas related
    //Low speed front vehicle collision warning level 1
    this.fillObject(rootElement.lang.alarm_name_840 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "840", "890", "activeSafetyAdas", false, true); //1
    //Low speed front vehicle collision warning level 2
    this.fillObject(rootElement.lang.alarm_name_840 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "841", "891", "activeSafetyAdas", false, true); //1
    //Forward collision warning level 1
    this.fillObject(rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "600", "650", "activeSafetyAdas", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "601", "651", "activeSafetyAdas", false, true); //1
    //Lane departure warning level 1
    this.fillObject(rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "602", "652", "activeSafetyAdas", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "603", "653", "activeSafetyAdas", false, true); //1
    //Alarm for vehicles too close to each other Level 1
    this.fillObject(rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "604", "654", "activeSafetyAdas", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "605", "655", "activeSafetyAdas", false, true); //1
    //Pedestrian Collision Alarm Level 1
    this.fillObject(rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "606", "656", "activeSafetyAdas", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "607", "657", "activeSafetyAdas", false, true); //1
    //Frequent lane changes Level 1
    this.fillObject(rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "608", "658", "activeSafetyAdas", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "609", "659", "activeSafetyAdas", false, true); //1
    //Road sign over-limit alarm level 1
    this.fillObject(rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "610", "660", "activeSafetyAdas", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "611", "661", "activeSafetyAdas", false, true); //1
    //Obstacle alarm level 1
    this.fillObject(rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "612", "662", "activeSafetyAdas", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "613", "663", "activeSafetyAdas", false, true); //1
    //Curved speed warning level 1
    this.fillObject(rootElement.lang.alarm_name_700 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "700", "750", "activeSafetyAdas", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_700 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "701", "751", "activeSafetyAdas", false, true); //1
    //Driving assistance function failure alarm level 1
    this.fillObject(rootElement.lang.alarm_name_715 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "715", "765", "activeSafetyAdas", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_715 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "716", "766", "activeSafetyAdas", false, true); //1
    //Intersection fast passing alarm level 1
    this.fillObject(rootElement.lang.alarm_name_728 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "728", "778", "activeSafetyAdas", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_728 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "729", "779", "activeSafetyAdas", false, true); //1
    //Solid line lane change alarm level 1
    this.fillObject(rootElement.lang.alarm_name_730 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "730", "780", "activeSafetyAdas", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_730 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "731", "781", "activeSafetyAdas", false, true); //1
    //Equipment failure reminder alarm level 1
    this.fillObject(rootElement.lang.alarm_name_732 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "732", "782", "activeSafetyAdas", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_732 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "733", "783", "activeSafetyAdas", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_542 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "542", "592", "activeSafetyAdas", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_542 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "543", "593", "activeSafetyAdas", false, true); //1

    //Black car alarm
    this.fillObject(rootElement.lang.alarm_name_530 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "530", "580", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_530 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "531", "581", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_532 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "532", "582", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_532 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "533", "583", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_534 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "534", "584", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_534 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "535", "585", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_536 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "536", "586", "activeSafetyAdas", false, true);
    this.fillObject(rootElement.lang.alarm_name_536 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "537", "587", "activeSafetyAdas", false, true);

    //dsm related
    //Fatigue driving alarm level 1
    this.fillObject(rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "618", "668", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "619", "669", "activeSafetyDsm", false, true);
    //Call the police Level 1
    this.fillObject(rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "620", "670", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "621", "671", "activeSafetyDsm", false, true); //1
    //Smoking alarm level 1
    this.fillObject(rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "622", "672", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "623", "673", "activeSafetyDsm", false, true); //1
    //Distracted driving alarm level 1
    this.fillObject(rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "624", "674", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "625", "675", "activeSafetyDsm", false, true); //1
    //Driver abnormality alarm level 1
    this.fillObject(rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "626", "676", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "627", "677", "activeSafetyDsm", false, true); //1
    //If you fail to look ahead for a long time, the alarm will be level 1.
    this.fillObject(rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "702", "752", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "703", "753", "activeSafetyDsm", false, true); //1
    //The system cannot work properly and alarm level 1
    this.fillObject(rootElement.lang.alarm_name_704 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "704", "754", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_704 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "705", "755", "activeSafetyDsm", false, true); //1
    //Level 1 alarm for driver not wearing a seat belt
    this.fillObject(rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "706", "756", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "707", "757", "activeSafetyDsm", false, true); //1
    //Alarm level 1 when the driver is not in the driving seat
    this.fillObject(rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "708", "758", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "709", "759", "activeSafetyDsm", false, true); //1
    //Level 1 alarm occurs when the driver takes his hands off the steering wheel
    this.fillObject(rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "710", "760", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "711", "761", "activeSafetyDsm", false, true); //1
    //Drinking water alarm level 1
    this.fillObject(rootElement.lang.alarm_name_644 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "644", "694", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_644 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "645", "695", "activeSafetyDsm", false, true); //1
    //Driver IC card abnormal alarm level 1
    this.fillObject(rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "641", "691", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "642", "692", "activeSafetyDsm", false, true); //1
    //Driver behavior monitoring function failure alarm level 1
    this.fillObject(rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "717", "767", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "718", "768", "activeSafetyDsm", false, true); //1
//
    this.fillObject(rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "734", "784", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "735", "785", "activeSafetyDsm", false, true); //1
//
    this.fillObject(rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "736", "786", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "737", "787", "activeSafetyDsm", false, true); //1
//
    this.fillObject(rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "738", "788", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "739", "789", "activeSafetyDsm", false, true); //1
    //Level 1 alarm for sunglasses failure
    this.fillObject(rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "639", "689", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "640", "690", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_745 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "745", "795", "activeSafetyDsm", false, true);
    this.fillObject(rootElement.lang.alarm_name_745 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "746", "796", "activeSafetyDsm", false, true);

    this.fillObject(rootElement.lang.alarm_name_845 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "845", "895", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_845 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "846", "896", "activeSafetyDsm", false, true); //1
    //Xiangbiao mobile phone
    this.fillObject(rootElement.lang.alarm_name_525 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "525", "575", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_525 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "541", "591", "activeSafetyDsm", false, true); //1

    //Intelligent detection
    this.fillObject(rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_11111, rootElement.lang.znjc, "740", "790", "activeSafetyZnjc", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_22222, rootElement.lang.znjc, "741", "791", "activeSafetyZnjc", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_11111, rootElement.lang.znjc, "742", "792", "activeSafetyZnjc", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_22222, rootElement.lang.znjc, "743", "793", "activeSafetyZnjc", false, true);   //1
}

AlarmManager.prototype.addAlarmTypeBy3 = function (hideEvent) {
//ADAS class
    //Low speed front vehicle collision warning level 1
    this.fillObject(rootElement.lang.alarm_name_840 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "840", "890", "activeSafetyAdas", false, true); //1
    //Low speed front vehicle collision warning level 2
    this.fillObject(rootElement.lang.alarm_name_840 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "841", "891", "activeSafetyAdas", false, true); //1
    //Forward collision warning level 1
    this.fillObject(rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "600", "650", "activeSafetyAdas", false, true);	//1
    //Forward collision warning level 2
    this.fillObject(rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "601", "651", "activeSafetyAdas", false, true);	//1
    //Lane departure warning level 1
    this.fillObject(rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "602", "652", "activeSafetyAdas", false, true);	//1
    //Lane departure warning level 2
    this.fillObject(rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "603", "653", "activeSafetyAdas", false, true);	//1
    //Road sign over-limit alarm level 2
    this.fillObject(rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "610", "660", "activeSafetyAdas", false, true);	//1
    //Road sign over-limit alarm level 1
    this.fillObject(rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "611", "661", "activeSafetyAdas", false, true);	//1
    //Frequent lane changes Level 2
    this.fillObject(rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "608", "658", "activeSafetyAdas", false, true);	//1
    //Frequent lane changes Level 1
    this.fillObject(rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "609", "659", "activeSafetyAdas", false, true);	//1
    //Pedestrian Collision Alarm Level 2
    this.fillObject(rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "606", "656", "activeSafetyAdas", false, true);	//1
    //Pedestrian Collision Alarm Level 1
    this.fillObject(rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "607", "657", "activeSafetyAdas", false, true);	//1
    //Alarm for vehicles too close to each other Level 2
    this.fillObject(rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "604", "654", "activeSafetyAdas", false, true);	//1
    //Alarm for vehicles too close to each other Level 1
    this.fillObject(rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "605", "655", "activeSafetyAdas", false, true);	//1
    //Obstacle alarm level 2
    this.fillObject(rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "612", "662", "activeSafetyAdas", false, true);	//1
    //Obstacle alarm level 1
    this.fillObject(rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "613", "663", "activeSafetyAdas", false, true);	//1
    //Curved speed warning level 1
    this.fillObject(rootElement.lang.alarm_name_700 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "700", "750", "activeSafetyAdas", false, true);	//1
    //Curved speed warning level 2
    this.fillObject(rootElement.lang.alarm_name_700 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "701", "751", "activeSafetyAdas", false, true);	//1
    //
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
        //Active capture event level 2
        this.fillObject(rootElement.lang.alarm_name_616 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "616", null, "activeSafetyAdas", false, true);	//1
        //Active capture event level 1
        this.fillObject(rootElement.lang.alarm_name_616 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "617", null, "activeSafetyAdas", false, true);	//1
        //Road sign recognition incident level 2
        this.fillObject(rootElement.lang.alarm_name_614 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "614", null, "activeSafetyAdas", false, true);	//1
        //Road Sign Recognition Incident Level 1
        this.fillObject(rootElement.lang.alarm_name_614 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "615", null, "activeSafetyAdas", false, true);	//1
    }
    //DSM class
    //Smoking alarm level 2
    this.fillObject(rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "622", "672", "activeSafetyDsm", false, true);	//1
    //Smoking alarm level 1
    this.fillObject(rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "623", "673", "activeSafetyDsm", false, true);	//1
    //Call the police Level 2
    this.fillObject(rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "620", "670", "activeSafetyDsm", false, true);	//1
    //Call the police Level 1
    this.fillObject(rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "621", "671", "activeSafetyDsm", false, true);	//1
    //Fatigue driving alarm level 2
    this.fillObject(rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "618", "668", "activeSafetyDsm", false, true);	//1
    //Fatigue driving alarm level 1
    this.fillObject(rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "619", "669", "activeSafetyDsm", false, true);	//1
    //Driver abnormality alarm level 2
    this.fillObject(rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "626", "676", "activeSafetyDsm", false, true);	//1
    //Driver abnormality alarm level 1
    this.fillObject(rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "627", "677", "activeSafetyDsm", false, true);	//1
    //Distracted driving alarm level 2
    this.fillObject(rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "624", "674", "activeSafetyDsm", false, true);	//1
    //Distracted driving alarm level 1
    this.fillObject(rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "625", "675", "activeSafetyDsm", false, true);	//1
    //If you fail to look ahead for a long time, the alarm will be level 1.
    this.fillObject(rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "702", "752", "activeSafetyDsm", false, true);	//1
    //If you fail to look ahead for a long time, the alarm will be level 2.
    this.fillObject(rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "703", "753", "activeSafetyDsm", false, true);	//1
    //The system cannot work properly and alarm level 1
    this.fillObject(rootElement.lang.alarm_name_704 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "704", "754", "activeSafetyDsm", false, true);	//1
    //The system cannot work properly and alarm level 2
    this.fillObject(rootElement.lang.alarm_name_704 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "705", "755", "activeSafetyDsm", false, true);	//1
    //Level 1 alarm for driver not wearing a seat belt
    this.fillObject(rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "706", "756", "activeSafetyDsm", false, true);	//1
    //Level 2 alarm for driver not wearing seat belt
    this.fillObject(rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "707", "757", "activeSafetyDsm", false, true);	//1
    //Alarm level 1 when the driver is not in the driving seat
    this.fillObject(rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "708", "758", "activeSafetyDsm", false, true);	//1
    //Level 2 alarm when the driver is not in the driving seat
    this.fillObject(rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "709", "759", "activeSafetyDsm", false, true);	//1
    //Level 1 alarm occurs when the driver takes his hands off the steering wheel
    this.fillObject(rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "710", "760", "activeSafetyDsm", false, true);	//1
    //Level 2 alarm occurs when the driver takes his hands off the steering wheel
    this.fillObject(rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "711", "761", "activeSafetyDsm", false, true);	//1
    //
    this.fillObject(rootElement.lang.alarm_name_644 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "644", "694", "activeSafetyDsm", false, true);	//1
    //
    this.fillObject(rootElement.lang.alarm_name_644 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "645", "695", "activeSafetyDsm", false, true);	//1
//		if(!enableSubiao()){
    //Driver IC card abnormal alarm level 1
    this.fillObject(rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "641", "691", "activeSafetyDsm", false, true);	//1
    //Driver IC card abnormal alarm level 2
    this.fillObject(rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "642", "692", "activeSafetyDsm", false, true);	//1
    //driver identification incident
    /*  if (!hideEvent) {
          this.fillObject(rootElement.lang.alarm_name_643, rootElement.lang.abnormality, "643", null, "activeSafetyDsm", false, true);	//1
      }*/
//        }
    //
    this.fillObject(rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "717", "767", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "718", "768", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_719, rootElement.lang.abnormality, "719", null, "activeSafetyDsm", false, true);	//1
    //DSM (elsewhere)
    this.fillObject(rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "734", "784", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "735", "785", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "736", "786", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "737", "787", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "738", "788", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "739", "789", "activeSafetyDsm", false, true);	//1
//		if(rootElement.myUserRole && rootElement.myUserRole.isIsSunglassFailure()){
    //Level 1 alarm for sunglasses failure
    this.fillObject(rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "639", "689", "activeSafetyDsm", false, true);	//1
    //Sunglasses failure level 2 alarm
    this.fillObject(rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "640", "690", "activeSafetyDsm", false, true);	//1
//		}
    //Take one hand off the steering wheel
    this.fillObject(rootElement.lang.alarm_name_745 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "745", "795", "activeSafetyDsm", false, true);
    this.fillObject(rootElement.lang.alarm_name_745 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "746", "796", "activeSafetyDsm", false, true);
    if (!hideEvent) {
        //Driver Change Event Level 2
        this.fillObject(rootElement.lang.alarm_name_630 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "630", null, "activeSafetyDsm", false, true);	//1
        //Driver Change Event Level 1
        this.fillObject(rootElement.lang.alarm_name_630 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "631", null, "activeSafetyDsm", false, true);	//1
        //Automatic capture event level 2
        this.fillObject(rootElement.lang.alarm_name_628 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "628", null, "activeSafetyDsm", false, true);	//1
        //Automatic capture event level 1
        this.fillObject(rootElement.lang.alarm_name_628 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "629", null, "activeSafetyDsm", false, true);	//1
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

    //tmps tire pressure
    //tire pressure alarm
    this.fillObject(rootElement.lang.alarm_name_632, rootElement.lang.tmps, "632", "682", "activeSafetyTmps", false, true);	//1

    //BDS proximity alarm
    //Rear approach alarm
    this.fillObject(rootElement.lang.alarm_name_633, rootElement.lang.proximity, "633", "683", "activeSafetyProximity", false, true);	//1
    //Left rear proximity alarm
    this.fillObject(rootElement.lang.alarm_name_634, rootElement.lang.proximity, "634", "684", "activeSafetyProximity", false, true);	//1
    //Right rear proximity alarm
    this.fillObject(rootElement.lang.alarm_name_635, rootElement.lang.proximity, "635", "685", "activeSafetyProximity", false, true);	//1

    //Aggressive driving
    //Intense driving alarm (Sichuan standard)
    this.fillObject(rootElement.lang.alarm_name_720, rootElement.lang.fierce_driving_type, "720", "770", "activeSafetyFierce", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_721, rootElement.lang.fierce_driving_type, "721", "771", "activeSafetyFierce", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_722, rootElement.lang.fierce_driving_type, "722", "772", "activeSafetyFierce", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_723, rootElement.lang.fierce_driving_type, "723", "773", "activeSafetyFierce", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_724, rootElement.lang.fierce_driving_type, "724", "774", "activeSafetyFierce", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_725, rootElement.lang.fierce_driving_type, "725", "775", "activeSafetyFierce", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_726, rootElement.lang.fierce_driving_type, "726", "776", "activeSafetyFierce", false, true);	//1

    //Intelligent detection
    this.fillObject(rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_11111, rootElement.lang.znjc, "740", "790", "activeSafetyZnjc", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_22222, rootElement.lang.znjc, "741", "791", "activeSafetyZnjc", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_11111, rootElement.lang.znjc, "742", "792", "activeSafetyZnjc", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_22222, rootElement.lang.znjc, "743", "793", "activeSafetyZnjc", false, true);	//1


    //Satellite positioning alarm (Sichuan standard)
    this.fillObject(rootElement.lang.alarm_name_727, rootElement.lang.satellite_positioning_type, "727", "777", "activeSafetySatellite", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_744, rootElement.lang.satellite_positioning_type, "744", "794", "activeSafetySatellite", false, true);	//1

    //Heilongjiang customization
    this.addHeiLongJiangAlarm();
    //Hunan (Hunan standard)
    this.addHuNanAlarm();
    //Active safety for dump trucks
    this.addMuckAlarm();
    this.addJiangSuAlarm();
    //Beijing proactive security
    this.addBeiJingAlarm();
    //Drink test
    this.addWineTestAlarm();
    //Sichuan
    this.addSiChuanAlarm();
    //Shanghai
    this.addShangHaiAlarm();
    //Active safety other alarms
    this.addSchoolAlarm();
}


AlarmManager.prototype.addWisdomScreenAlarm = function () {
    this.fillObject(rootElement.lang.alarm_name_11, rootElement.lang.over_speed_alarm, "11", "61", "speendAlarm", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_49, rootElement.lang.fatigueAlarm, "49", "99", "tiredAlarm", false, true);
    //speed warning
    this.fillObject(rootElement.lang.alarm_name_428, rootElement.lang.over_speed_alarm, "428", "478", "speendAlarm", false, true);
    //Early morning operation
    this.fillObject(rootElement.lang.alarm_name_151, rootElement.lang.offline_early_morning_alarm, "151", "152", "offlineEarlyMorningAlarm", false, true);
    //Offline displacement 136
    this.fillObject(rootElement.lang.alarm_name_136, rootElement.lang.offline_early_morning_alarm, "136", "", "offlineEarlyMorningAlarm", false, true);   //1
    //ADAS class
    //Low speed front vehicle collision warning level 1
    //Forward collision warning level 1
    this.fillObject(rootElement.lang.alarm_name_600, rootElement.lang.safetyAdas, "600-601", "650", "activeSafetyAdas", false, true);	//1
    //Lane departure warning level 1
    this.fillObject(rootElement.lang.alarm_name_602, rootElement.lang.safetyAdas, "602-603", "652", "activeSafetyAdas", false, true);	//1
    //Road sign over-limit alarm level 2
    this.fillObject(rootElement.lang.alarm_name_610, rootElement.lang.safetyAdas, "610-611", "660", "activeSafetyAdas", false, true);	//1
    //Frequent lane changes Level 1
    this.fillObject(rootElement.lang.alarm_name_608, rootElement.lang.safetyAdas, "608-609", "658", "activeSafetyAdas", false, true);	//1
    //Pedestrian Collision Alarm Level 1
    this.fillObject(rootElement.lang.alarm_name_606, rootElement.lang.safetyAdas, "606-607", "656", "activeSafetyAdas", false, true);	//1
    //Alarm for vehicles too close to each other Level 1
    this.fillObject(rootElement.lang.alarm_name_604, rootElement.lang.safetyAdas, "604-605", "654", "activeSafetyAdas", false, true);	//1
    //Obstacle alarm level 1
    this.fillObject(rootElement.lang.alarm_name_612, rootElement.lang.safetyAdas, "612-613", "662", "activeSafetyAdas", false, true);	//1
    //Curved speed warning level 1
    this.fillObject(rootElement.lang.alarm_name_700, rootElement.lang.safetyAdas, "700-701", "750", "activeSafetyAdas", false, true);	//1
    //
    this.fillObject(rootElement.lang.alarm_name_715, rootElement.lang.safetyAdas, "715-716", "765", "activeSafetyAdas", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_728, rootElement.lang.safetyAdas, "728-729", "778", "activeSafetyAdas", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_730, rootElement.lang.safetyAdas, "730-731", "780", "activeSafetyAdas", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_732, rootElement.lang.safetyAdas, "732-733", "782", "activeSafetyAdas", false, true);	//1
    //DSM class
    //Smoking alarm level 1
    this.fillObject(rootElement.lang.alarm_name_622, rootElement.lang.abnormality, "622-623", "672", "activeSafetyDsm", false, true);	//1
    //Call the police Level 1
    this.fillObject(rootElement.lang.alarm_name_620, rootElement.lang.abnormality, "620-621", "670", "activeSafetyDsm", false, true);	//1
    //Fatigue driving alarm level 1
    this.fillObject(rootElement.lang.alarm_name_618, rootElement.lang.abnormality, "618-619", "668", "activeSafetyDsm", false, true);	//1
    //Driver abnormality alarm level 1
    this.fillObject(rootElement.lang.alarm_name_626, rootElement.lang.abnormality, "626-627", "676", "activeSafetyDsm", false, true);	//1
    //Distracted driving alarm level 1
    this.fillObject(rootElement.lang.alarm_name_624, rootElement.lang.abnormality, "624-625", "674", "activeSafetyDsm", false, true);	//1
    //If you fail to look ahead for a long time, the alarm will be level 1.
    this.fillObject(rootElement.lang.alarm_name_702, rootElement.lang.abnormality, "702-703", "752", "activeSafetyDsm", false, true);	//1
    //The system cannot work properly and alarm level 1
    this.fillObject(rootElement.lang.alarm_name_704, rootElement.lang.abnormality, "704-705", "754", "activeSafetyDsm", false, true);	//1
    //Level 1 alarm for driver not wearing a seat belt
    this.fillObject(rootElement.lang.alarm_name_706, rootElement.lang.abnormality, "706-707", "756", "activeSafetyDsm", false, true);	//1
    //Alarm level 1 when the driver is not in the driving seat
    this.fillObject(rootElement.lang.alarm_name_708, rootElement.lang.abnormality, "708-709", "758", "activeSafetyDsm", false, true);	//1
    //Level 1 alarm occurs when the driver takes his hands off the steering wheel
    this.fillObject(rootElement.lang.alarm_name_710, rootElement.lang.abnormality, "710-711", "760", "activeSafetyDsm", false, true);	//1
    //
    this.fillObject(rootElement.lang.alarm_name_644, rootElement.lang.abnormality, "644-645", "694", "activeSafetyDsm", false, true);	//1
    //Driver IC card abnormal alarm level 1
    this.fillObject(rootElement.lang.alarm_name_641, rootElement.lang.abnormality, "641-642", "691", "activeSafetyDsm", false, true);	//1
    //
    this.fillObject(rootElement.lang.alarm_name_717, rootElement.lang.abnormality, "717-718", "767", "activeSafetyDsm", false, true);	//1
    //DSM (elsewhere)
    this.fillObject(rootElement.lang.alarm_name_734, rootElement.lang.abnormality, "734-735", "784", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_736, rootElement.lang.abnormality, "736-737", "786", "activeSafetyDsm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_738, rootElement.lang.abnormality, "738-739", "788", "activeSafetyDsm", false, true);	//1
    //Level 1 alarm for sunglasses failure
    this.fillObject(rootElement.lang.alarm_name_639, rootElement.lang.abnormality, "639-640", "689", "activeSafetyDsm", false, true);	//1
    //Take one hand off the steering wheel
    this.fillObject(rootElement.lang.alarm_name_745, rootElement.lang.abnormality, "745-746", "795", "activeSafetyDsm", false, true);
    this.fillObject(rootElement.lang.alarm_name_845, rootElement.lang.abnormality, "845-846", "895", "activeSafetyDsm", false, true); //1
    //Driver change event
    this.fillObject(rootElement.lang.alarm_name_630, rootElement.lang.abnormality, "630-631", null, "activeSafetyDsm", false, true); //1
    /*****Other alarms*****/
    //Overtime parking alarm
    this.fillObject(rootElement.lang.alarm_name_14, rootElement.lang.monitor_alarm_otherAlarm, "14", null, "otherAlarm", false, true); //1
    //Total driving time exceeded on the day
    this.fillObject(rootElement.lang.alarm_name_210, rootElement.lang.monitor_alarm_otherAlarm, "210", null, "otherAlarm", false, true); //1
    /*****error alarm*****/
    //Camera failure
    this.fillObject(rootElement.lang.alarm_name_209, rootElement.lang.monitor_alarm_fault, "209", null, "faultAlarm", false, true); //1
    //tmps tire pressure
    //tire pressure alarm
    this.fillObject(rootElement.lang.alarm_name_632, rootElement.lang.tmps, "632", "682", "activeSafetyTmps", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_6321, rootElement.lang.tmps, "6321", null, "activeSafetyTmps", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_6322, rootElement.lang.tmps, "6322", null, "activeSafetyTmps", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_6323, rootElement.lang.tmps, "6323", null, "activeSafetyTmps", false, true);	//1
    //BDS proximity alarm
    //Rear approach alarm
    this.fillObject(rootElement.lang.alarm_name_633, rootElement.lang.proximity, "633", "683", "activeSafetyProximity", false, true);	//1
    //Left rear proximity alarm
    this.fillObject(rootElement.lang.alarm_name_634, rootElement.lang.proximity, "634", "684", "activeSafetyProximity", false, true);	//1
    //Right rear proximity alarm
    this.fillObject(rootElement.lang.alarm_name_635, rootElement.lang.proximity, "635", "685", "activeSafetyProximity", false, true);	//1
    //Aggressive driving
    //Intense driving alarm (Sichuan standard)
    this.fillObject(rootElement.lang.alarm_name_720, rootElement.lang.fierce_driving_type, "720", "770", "activeSafetyFierce", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_721, rootElement.lang.fierce_driving_type, "721", "771", "activeSafetyFierce", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_722, rootElement.lang.fierce_driving_type, "722", "772", "activeSafetyFierce", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_723, rootElement.lang.fierce_driving_type, "723", "773", "activeSafetyFierce", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_724, rootElement.lang.fierce_driving_type, "724", "774", "activeSafetyFierce", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_725, rootElement.lang.fierce_driving_type, "725", "775", "activeSafetyFierce", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_726, rootElement.lang.fierce_driving_type, "726", "776", "activeSafetyFierce", false, true);	//1
    //Intelligent detection
    this.fillObject(rootElement.lang.alarm_name_740, rootElement.lang.znjc, "740-741", "790", "activeSafetyZnjc", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_742, rootElement.lang.znjc, "742-743", "792", "activeSafetyZnjc", false, true);	//1
    //Satellite positioning alarm (Sichuan standard)
    this.fillObject(rootElement.lang.alarm_name_727, rootElement.lang.satellite_positioning_type, "727", "777", "activeSafetySatellite", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_744, rootElement.lang.satellite_positioning_type, "744", "794", "activeSafetySatellite", false, true);	//1
    //Heilongjiang customization
    //this.addHeiLongJiangAlarm();
}


AlarmManager.prototype.addAlarmTypeBy1 = function () {
    if (rootElement.myUserRole && !rootElement.myUserRole.isShieldReport()) {
        this.fillObject(rootElement.lang.alarm_name_231, rootElement.lang.monitor_alarm_otherAlarm, "231", "281", "otherAlarm", false, true);	//Overcrowded
    }
    this.fillObject(rootElement.lang.alarm_name_138, rootElement.lang.monitor_alarm_otherAlarm, "138", "", "otherAlarm", false, true);//Illegal uninstallation
    this.fillObject(rootElement.lang.alarm_name_139, rootElement.lang.monitor_alarm_otherAlarm, "139", "", "otherAlarm", false, true);	//Heavy truck trunk lid is not closed
    this.fillObject(rootElement.lang.alarm_name_411, rootElement.lang.monitor_alarm_otherAlarm, "411", "", "otherAlarm", false, true);//The card is not inserted, the driver’s identity is verified or the vehicle is started without ID verification.
}

AlarmManager.prototype.addAlarmTypeBy10 = function () {
    //Custom alarm
    //Platform inspection
    this.fillObject(rootElement.lang.platformInspect, rootElement.lang.manage_my_government, ((113 << 16) + 21).toString(), null, "government", false, true);	//1
    //Call the police and supervise
    this.fillObject(rootElement.lang.alarmSupervision, rootElement.lang.manage_my_government, ((113 << 16) + 29).toString(), null, "government", false, true);	//1
    //this.fillObject(rootElement.lang.alarm_name_1, rootElement.lang.alarm_name_1,"113",null,"customAlarm",true,true);	//1
    this.fillObject(rootElement.lang.alarm_name_638, rootElement.lang.alarm_name_1, "638", null, "customAlarm", false, true);	//1
}

AlarmManager.prototype.addAlarmTypeByCustom = function () {
    this.fillObject(rootElement.lang.alarm_name_113, rootElement.lang.alarm_name_1, "113", null, "customAlarm", true, true);	//1
}

AlarmManager.prototype.addAlarmTypeByAll = function (hideEvent) {
    //speed alarm
    this.fillObject(rootElement.lang.alarm_name_428, rootElement.lang.over_speed_alarm, "428", "478", "speendAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_11, rootElement.lang.over_speed_alarm, "11", "61", "speendAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_200, rootElement.lang.over_speed_alarm, "200", "250", "speendAlarm", false, true);	//1
    if (!this.isRemovePlatform) {
        this.fillObject(rootElement.lang.alarm_name_300, rootElement.lang.over_speed_alarm, "300", "350", "speendAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_309, rootElement.lang.over_speed_alarm, "309", "359", "speendAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_304, rootElement.lang.over_speed_alarm, "304", "354", "speendAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_311, rootElement.lang.over_speed_alarm, "311", "361", "speendAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1333, rootElement.lang.over_speed_alarm, "1333", null, "speendAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1315, rootElement.lang.over_speed_alarm, "1315", "1365", "speendAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_1316, rootElement.lang.over_speed_alarm, "1316", "1366", "speendAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_1317, rootElement.lang.over_speed_alarm, "1317", "1367", "speendAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_1318, rootElement.lang.over_speed_alarm, "1318", "1368", "speendAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_1346, rootElement.lang.over_speed_alarm, "1346", "1396", "speendAlarm", false, true);
    }
    //tired Alarm
    this.fillObject(rootElement.lang.alarm_name_429, rootElement.lang.fatigueAlarm, "429", "479", "tiredAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_49, rootElement.lang.fatigueAlarm, "49", "99", "tiredAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1031, rootElement.lang.fatigueAlarm, "1031", null, "tiredAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1032, rootElement.lang.fatigueAlarm, "1032", null, "tiredAlarm", false, true);
    if (!this.isRemovePlatform) {
        //Fatigue driving warning (platform) 1109
        this.fillObject(rootElement.lang.alarm_name_1109, rootElement.lang.fatigueAlarm, "1109", null, "tiredAlarm", false, true);  //1
        this.fillObject(rootElement.lang.alarm_name_306_default, rootElement.lang.fatigueAlarm, "306", "356", "tiredAlarm", false, true);	//1
        //Daytime Fatigue (Platform)
        this.fillObject(rootElement.lang.alarm_name_1126, rootElement.lang.fatigueAlarm, "1126", null, "tiredAlarm", false, true);
        //Nighttime Fatigue (Platform)
        this.fillObject(rootElement.lang.alarm_name_1127, rootElement.lang.fatigueAlarm, "1127", null, "tiredAlarm", false, true);
        //Cumulative fatigue (platform)
        this.fillObject(rootElement.lang.alarm_name_1121, rootElement.lang.fatigueAlarm, "1121", null, "tiredAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_1319, rootElement.lang.fatigueAlarm, "1319", "1369", "tiredAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_1320, rootElement.lang.fatigueAlarm, "1320", "1370", "tiredAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_1321, rootElement.lang.fatigueAlarm, "1321", "1371", "tiredAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_1322, rootElement.lang.fatigueAlarm, "1322", "1372", "tiredAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_1323, rootElement.lang.fatigueAlarm, "1323", "1373", "tiredAlarm", false, true);
    }
    // offline/early morning alarm
    if (!this.isRemovePlatform) {
        this.fillObject(rootElement.lang.alarm_name_136, rootElement.lang.offline_early_morning_alarm, "136", null, "offlineEarlyMorningAlarm", false, true);	//1
        //Driving is prohibited at night. Platform generated
        this.fillObject(rootElement.lang.alarm_name_151, rootElement.lang.offline_early_morning_alarm, "151", "152", "offlineEarlyMorningAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1334 + rootElement.lang.alarm_name_11111, rootElement.lang.offline_early_morning_alarm,  "1334","1384", "offlineEarlyMorningAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1334 + rootElement.lang.alarm_name_22222, rootElement.lang.offline_early_morning_alarm,  "1335","1385", "offlineEarlyMorningAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1334 + rootElement.lang.alarm_name_33333, rootElement.lang.offline_early_morning_alarm,  "1336","1386", "offlineEarlyMorningAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1334 + rootElement.lang.alarm_name_44444, rootElement.lang.offline_early_morning_alarm,  "1500","1550", "offlineEarlyMorningAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1334 + rootElement.lang.alarm_name_55555, rootElement.lang.offline_early_morning_alarm,  "1501","1551", "offlineEarlyMorningAlarm", false, true);	//1
    }






    if (!this.isRemovePlatform) {
        this.fillObject(rootElement.lang.alarm_name_1518, rootElement.lang.monitor_alarm_platform, "1518", "", "platformAlarm", false, true);	//1
    }
    //Video alarm
    this.fillObject(rootElement.lang.alarm_name_15, rootElement.lang.monitor_alarm_video, "15", "65", "videoAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_4, rootElement.lang.monitor_alarm_video, "4", "54", "videoAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_5, rootElement.lang.monitor_alarm_video, "5", "55", "videoAlarm", false, true);	//1
    //Hard drive alarm
    this.fillObject(rootElement.lang.alarm_name_39, rootElement.lang.monitor_alarm_disk, "39", null, "diskAlarm", false, false);	//1
    this.fillObject(rootElement.lang.alarm_name_40, rootElement.lang.monitor_alarm_disk, "40", null, "diskAlarm", false, false);	//1
    this.fillObject(rootElement.lang.alarm_name_10, rootElement.lang.monitor_alarm_disk, "10", "60", "diskAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_335, rootElement.lang.monitor_alarm_disk, "335", "385", "diskAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_157, rootElement.lang.monitor_alarm_disk, "157", "158", "diskAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_162, rootElement.lang.monitor_alarm_disk, "162", "163", "diskAlarm", false, true);	//1
    //error alarm
    this.fillObject(rootElement.lang.alarm_name_45, rootElement.lang.monitor_alarm_fault, "45", "85", "faultAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_18, rootElement.lang.monitor_alarm_fault, "18", "68", "faultAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_202, rootElement.lang.monitor_alarm_fault, "202", "252", "faultAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_203, rootElement.lang.monitor_alarm_fault, "203", "253", "faultAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_204, rootElement.lang.monitor_alarm_fault, "204", "254", "faultAlarm", false, true);	//1
    if (rootElement.myUserRole && !rootElement.myUserRole.isShieldReport()) {
        this.fillObject(rootElement.lang.alarm_name_207, rootElement.lang.monitor_alarm_fault, "207", "257", "faultAlarm", false, true);	//1
    }
    this.fillObject(rootElement.lang.alarm_name_208, rootElement.lang.monitor_alarm_fault, "208", "258", "faultAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_209, rootElement.lang.monitor_alarm_fault, "209", "259", "faultAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_215, rootElement.lang.monitor_alarm_fault, "215", "265", "faultAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_712, rootElement.lang.monitor_alarm_fault, "712", "762", "faultAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_405, rootElement.lang.monitor_alarm_fault, "405", "455", "faultAlarm", false, true);


    //Taxi related fault alarm
    //Detection alarm
    this.fillObject(rootElement.lang.alarm_name_815, rootElement.lang.vehicle_Taxi, "815", "865", "taxiAlarm", false, true);	//1
    //Call the police for not wearing a mask
    this.fillObject(rootElement.lang.alarm_name_816, rootElement.lang.vehicle_Taxi, "816", "866", "taxiAlarm", false, true);	//1
    //No meter is turned on when there are customers, operation alarm
    this.fillObject(rootElement.lang.alarm_name_848, rootElement.lang.vehicle_Taxi, "848", "898", "taxiAlarm", false, true);	//1
    //Call the alarm when there are no customers
    this.fillObject(rootElement.lang.alarm_name_849, rootElement.lang.vehicle_Taxi, "849", "899", "taxiAlarm", false, true);	//1
    //Trip meter failure
    this.fillObject(rootElement.lang.alarm_name_800, rootElement.lang.vehicle_Taxi, "800", "850", "taxiAlarm", false, true);	//1
    //Service evaluator failure (front and back)
    this.fillObject(rootElement.lang.alarm_name_801, rootElement.lang.vehicle_Taxi, "801", "851", "taxiAlarm", false, true);	//1
    //LED advertising screen failure
    this.fillObject(rootElement.lang.alarm_name_802, rootElement.lang.vehicle_Taxi, "802", "852", "taxiAlarm", false, true);	//1
    //Liquid crystal (LCD) display failure
    this.fillObject(rootElement.lang.alarm_name_803, rootElement.lang.vehicle_Taxi, "803", "853", "taxiAlarm", false, true);	//1
    //Security access module failure
    this.fillObject(rootElement.lang.alarm_name_804, rootElement.lang.vehicle_Taxi, "804", "854", "taxiAlarm", false, true);	//1
    //Cruise dome light failure
    this.fillObject(rootElement.lang.alarm_name_805, rootElement.lang.vehicle_Taxi, "805", "855", "taxiAlarm", false, true);	//1
    //Continuous driving timeout
    this.fillObject(rootElement.lang.alarm_name_806, rootElement.lang.vehicle_Taxi, "806", "856", "taxiAlarm", false, true);	//1
    //Driving on prohibited roads
    this.fillObject(rootElement.lang.alarm_name_807, rootElement.lang.vehicle_Taxi, "807", "857", "taxiAlarm", false, true);	//1
    //LCD terminal failure
    this.fillObject(rootElement.lang.alarm_name_808, rootElement.lang.vehicle_Taxi, "808", "858", "taxiAlarm", false, true);	//1
    //Recording equipment failure
    this.fillObject(rootElement.lang.alarm_name_809, rootElement.lang.vehicle_Taxi, "809", "859", "taxiAlarm", false, true);	//1
    //The real-time clock of the metering and pricing device exceeds the specified error range.
    this.fillObject(rootElement.lang.alarm_name_810, rootElement.lang.vehicle_Taxi, "810", "860", "taxiAlarm", false, true);	//1
    //Emergency alarm button failure
    this.fillObject(rootElement.lang.alarm_name_811, rootElement.lang.vehicle_Taxi, "811", "861", "taxiAlarm", false, true);	//1
    //Cruise buses operate without clocks/Online ride-hailing cruises take passengers
    this.fillObject(rootElement.lang.alarm_name_812, rootElement.lang.vehicle_Taxi, "812", "862", "taxiAlarm", false, true);	//1
    //Taxi related
    //Driver face recognition mismatch alarm
    this.fillObject(rootElement.lang.alarm_name_813, rootElement.lang.vehicle_Taxi, "813", "863", "taxiAlarm", false, true);	//1
    //Operational data upload event
    this.fillObject(rootElement.lang.alarm_name_814, rootElement.lang.vehicle_Taxi, "814", "864", "taxiAlarm", false, true);	//1
    //Abnormal body temperature alarm
    this.fillObject(rootElement.lang.alarm_name_1002, rootElement.lang.vehicle_Taxi, "1002", null, "taxiAlarm", false, true);

    //Backup battery undervoltage alarm
    this.fillObject(rootElement.lang.alarm_name_538, rootElement.lang.monitor_alarm_fault, "538", "588", "faultAlarm", false, true);	//1
    //Backup battery failure alarm
    this.fillObject(rootElement.lang.alarm_name_539, rootElement.lang.monitor_alarm_fault, "539", "589", "faultAlarm", false, true);	//1
    //Backup memory failure alarm
    this.fillObject(rootElement.lang.alarm_name_540, rootElement.lang.monitor_alarm_fault, "540", "590", "faultAlarm", false, true);	//1
    //Operation alarm
    this.fillObject(rootElement.lang.alarm_name_2, rootElement.lang.monitor_alarm_operate, "2", "52", "operateAlarm", true, true);	//1
    this.fillObject(rootElement.lang.alarm_name_6, rootElement.lang.monitor_alarm_operate, "6", "56", "operateAlarm", false, true);	//1
    //Oil level alarm
    this.fillObject(rootElement.lang.alarm_name_46, rootElement.lang.monitor_alarm_fuel, "46", "86", "fuelAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_47, rootElement.lang.monitor_alarm_fuel, "47", "87", "fuelAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_216, rootElement.lang.monitor_alarm_fuel, "216", "266", "fuelAlarm", false, true);	//1
    //Other alarms
    this.fillObject(rootElement.lang.alarm_name_9, rootElement.lang.monitor_alarm_otherAlarm, "9", "59", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_153, rootElement.lang.monitor_alarm_otherAlarm, "153", "154", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_155, rootElement.lang.monitor_alarm_otherAlarm, "155", "156", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_159, rootElement.lang.monitor_alarm_otherAlarm, "159", "160", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_166, rootElement.lang.monitor_alarm_otherAlarm, "166", "167", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_7, rootElement.lang.monitor_alarm_otherAlarm, "7", "57", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_13, rootElement.lang.monitor_alarm_otherAlarm, "13", "63", "otherAlarm", false, true);	//1

    this.fillObject(rootElement.lang.alarm_name_3, rootElement.lang.monitor_alarm_abnormal, "3", "53", "monitorAlarmAbnormal", true, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1019, rootElement.lang.monitor_alarm_abnormal, "1019", "1069", "monitorAlarmAbnormal", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1020, rootElement.lang.monitor_alarm_abnormal, "1020", "1070", "monitorAlarmAbnormal", false, true);	//1

    this.fillObject(rootElement.lang.alarm_name_16, rootElement.lang.monitor_alarm_otherAlarm, "16", "66", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_201, rootElement.lang.monitor_alarm_otherAlarm, "201", "251", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_205, rootElement.lang.monitor_alarm_otherAlarm, "205", "255", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_206, rootElement.lang.monitor_alarm_otherAlarm, "206", "256", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_210, rootElement.lang.monitor_alarm_otherAlarm, "210", "260", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_14, rootElement.lang.monitor_alarm_otherAlarm, "14", "64", "otherAlarm", false, true);	//1
    if (rootElement.myUserRole && !rootElement.myUserRole.isShieldReport()) {
        this.fillObject(rootElement.lang.alarm_name_192, rootElement.lang.monitor_alarm_otherAlarm, "192", "193", "otherAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_217, rootElement.lang.monitor_alarm_otherAlarm, "217", "267", "otherAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_8, rootElement.lang.monitor_alarm_otherAlarm, "8", "58", "otherAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_218, rootElement.lang.monitor_alarm_otherAlarm, "218", "268", "otherAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_182, rootElement.lang.monitor_alarm_otherAlarm, "182", null, "otherAlarm", false, false);	//1
        this.fillObject(rootElement.lang.alarm_name_183, rootElement.lang.monitor_alarm_otherAlarm, "183", null, "otherAlarm", false, false);	//1
    }

    this.fillObject(rootElement.lang.alarm_name_184, rootElement.lang.monitor_alarm_otherAlarm, "184", null, "otherAlarm", false, false);	//1
    this.fillObject(rootElement.lang.alarm_name_185, rootElement.lang.monitor_alarm_otherAlarm, "185", null, "otherAlarm", false, false);	//1
    this.fillObject(rootElement.lang.alarm_name_239, rootElement.lang.monitor_alarm_otherAlarm, "239", null, "otherAlarm", false, false);	//1
    this.fillObject(rootElement.lang.alarm_name_235, rootElement.lang.monitor_alarm_otherAlarm, "235", "285", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_236, rootElement.lang.monitor_alarm_otherAlarm, "236", "286", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_237, rootElement.lang.monitor_alarm_otherAlarm, "237", "287", "otherAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_238, rootElement.lang.monitor_alarm_otherAlarm, "238", "288", "otherAlarm", false, true);	//1
    //Only the monitoring alarm details can be viewed during the time occupied.
    this.fillObject(rootElement.lang.alarm_name_445, rootElement.lang.monitor_alarm_otherAlarm, "445", "495", "otherAlarm", false, true);	//1

    //Added on April 26, 2017 10:52:34
    if (rootElement.myUserRole && !rootElement.myUserRole.isShieldReport()) {
        this.fillObject(rootElement.lang.alarm_name_244, rootElement.lang.monitor_alarm_otherAlarm, "244", "294", "otherAlarm", false, true);	//Other video equipment failure alarms
        this.fillObject(rootElement.lang.alarm_name_245, rootElement.lang.monitor_alarm_otherAlarm, "245", "295", "otherAlarm", false, true);	//Special alarm: The recording reaches the storage threshold alarm.
        this.fillObject(rootElement.lang.alarm_name_194, rootElement.lang.monitor_alarm_otherAlarm, "194", "195", "otherAlarm", false, true);  //Smoke alarm
        this.fillObject(rootElement.lang.abnormal_drive, rootElement.lang.monitor_alarm_otherAlarm, "248", "298", "otherAlarm", false, true);  //Abnormal driving
    }


    this.fillObject(rootElement.lang.alarm_name_146, rootElement.lang.monitor_alarm_otherAlarm, "146", null, "otherAlarm", false, true);  //Smoke alarm
    this.fillObject(rootElement.lang.alarm_name_147, rootElement.lang.monitor_alarm_otherAlarm, "147", null, "otherAlarm", false, true);  //Abnormal driving
    if (rootElement.myUserRole && !rootElement.myUserRole.isShieldReport()) {
        this.fillObject(rootElement.lang.alarm_name_231, rootElement.lang.monitor_alarm_otherAlarm, "231", "281", "otherAlarm", false, true);  //Overcrowded
    }
    this.fillObject(rootElement.lang.alarm_name_135, rootElement.lang.monitor_alarm_otherAlarm, "135", null, "otherAlarm", false, true);  //808 passenger flow statistics
    //Driver swipes card 442
    this.fillObject(rootElement.lang.alarm_name_442, rootElement.lang.monitor_alarm_otherAlarm, "442", "", "otherAlarm", false, true);	//1
    //Driver information collection and reporting 116
    this.fillObject(rootElement.lang.alarm_name_116, rootElement.lang.monitor_alarm_otherAlarm, "116", "", "otherAlarm", false, true);	//1
    //FTP task file changes 143
    // this.fillObject(rootElement.lang.alarm_name_143, rootElement.lang.monitor_alarm_otherAlarm, "143", "", "otherAlarm", false, true);	//1
    //Student swipe card 443
    this.fillObject(rootElement.lang.alarm_name_443, rootElement.lang.monitor_alarm_otherAlarm, "443", "", "otherAlarm", false, true);	//1

    //Fatigue 84220 alarm 125
    this.fillObject(rootElement.lang.alarm_name_125, rootElement.lang.monitor_alarm_otherAlarm, "125", "", "otherAlarm", false, true);	//1
    //Forward
    this.fillObject(rootElement.lang.alarm_name_1000, rootElement.lang.monitor_alarm_otherAlarm, "1000", "1050", "otherAlarm", false, true);
    //reverse
    this.fillObject(rootElement.lang.alarm_name_1001, rootElement.lang.monitor_alarm_otherAlarm, "1001", "1051", "otherAlarm", false, true);
    //stop spinning
    this.fillObject(rootElement.lang.alarm_name_1030, rootElement.lang.monitor_alarm_otherAlarm, "1030", "1080", "otherAlarm", false, true);
    //Overcrowding reminder
    this.fillObject(rootElement.lang.alarm_name_148, rootElement.lang.monitor_alarm_otherAlarm, "148", "", "otherAlarm", false, true);
    //Curve speeding alarm
    this.fillObject(rootElement.lang.alarm_name_178, rootElement.lang.monitor_alarm_otherAlarm, "178", "", "otherAlarm", false, true);
    //Straight road speeding alarm
    this.fillObject(rootElement.lang.alarm_name_180, rootElement.lang.monitor_alarm_otherAlarm, "180", "", "otherAlarm", false, true);
    //Weight increase alarm
    this.fillObject(rootElement.lang.alarm_name_1324, rootElement.lang.monitor_alarm_otherAlarm, "1324", "1374", "otherAlarm", false, true);
    //weight loss alarm
    this.fillObject(rootElement.lang.alarm_name_1325, rootElement.lang.monitor_alarm_otherAlarm, "1325", "1375", "otherAlarm", false, true);
    //Anti-hijacking alarm
    this.fillObject(rootElement.lang.alarm_name_36, rootElement.lang.monitor_alarm_otherAlarm, "36", "", "otherAlarm", false, true);
    //vehicle stolen alarm
    // this.fillObject(rootElement.lang.alarm_name_217, rootElement.lang.monitor_alarm_otherAlarm, "217", "", "otherAlarm", false, true);
    //Passenger calls the police
    this.fillObject(rootElement.lang.alarm_name_1015, rootElement.lang.monitor_alarm_otherAlarm, "1015", "1065", "otherAlarm", false, true);
    //Call the police if a passenger does not wear a mask
    this.fillObject(rootElement.lang.alarm_name_1014, rootElement.lang.monitor_alarm_otherAlarm, "1014", "", "otherAlarm", false, true);
    //Passenger temperature abnormality alarm
    this.fillObject(rootElement.lang.alarm_name_1013, rootElement.lang.monitor_alarm_otherAlarm, "1013", "", "otherAlarm", false, true);
    //Door sensor status alarm
    this.fillObject(rootElement.lang.alarm_name_1018, rootElement.lang.monitor_alarm_otherAlarm, "1018", "1068", "otherAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1249, rootElement.lang.monitor_alarm_otherAlarm, "1249", "", "otherAlarm", false, true);


    //Temporary rule alarm Road bill alarm (PetroChina)
    if (rootElement.myUserRole && rootElement.myUserRole.isZSYRoadList()) {
        this.fillObject(rootElement.lang.alarm_name_149, rootElement.lang.monitor_alarm_otherAlarm, "149", null, "otherAlarm", false, true);  //Overcrowded
        this.fillObject(rootElement.lang.alarm_name_48, rootElement.lang.monitor_alarm_otherAlarm, "48", null, "otherAlarm", false, true);  //Overcrowded
    }
    //IO alarm
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
    //fence alarm
    this.fillObject(rootElement.lang.alarm_name_27, rootElement.lang.monitor_alarm_fence, "27", "77", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_28, rootElement.lang.monitor_alarm_fence, "28", "78", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_29, rootElement.lang.monitor_alarm_fence, "29", "79", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_30, rootElement.lang.monitor_alarm_fence, "30", "80", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_31, rootElement.lang.monitor_alarm_fence, "31", "81", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_32, rootElement.lang.monitor_alarm_fence, "32", "82", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_33, rootElement.lang.monitor_alarm_fence, "33", "83", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_34, rootElement.lang.monitor_alarm_fence, "34", "84", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_12, rootElement.lang.monitor_alarm_fence, "12", "62", "fenceAlarm", false, true);	//1

    this.fillObject(rootElement.lang.alarm_name_211, rootElement.lang.monitor_alarm_fence, "211", "261", "fenceAlarm", true, true);	//1
    this.fillObject(rootElement.lang.alarm_name_212, rootElement.lang.monitor_alarm_fence, "212", "262", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_213, rootElement.lang.monitor_alarm_fence, "213", "263", "fenceAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_214, rootElement.lang.monitor_alarm_fence, "214", "264", "fenceAlarm", false, true);	//1


    if (rootElement.myUserRole && rootElement.myUserRole.isPolice()) {
        //
        this.fillObject(rootElement.lang.alarm_name_100, rootElement.lang.ai_alarm, "100", "", "aiAlarm", true, true);	//1
        this.fillObject(rootElement.lang.alarm_name_150, rootElement.lang.ai_alarm, "150", "", "aiAlarm", true, true);	//1
        //
        this.fillObject(rootElement.lang.alarm_name_144_default, rootElement.lang.ai_alarm, "144", "", "aiAlarm", true, true);	//1
        //Power supply low voltage alarm 205 is different from V6 alarm
        this.fillObject(rootElement.lang.alarm_low_battery_voltage, rootElement.lang.monitor_alarm_abnormal, "205", "255", "monitorAlarmAbnormal", true, true);

        this.fillObject(rootElement.lang.alarm_name_1024, rootElement.lang.security_alarm, "1024", "1074", "securityAlarm", true, true);
        this.fillObject(rootElement.lang.alarm_name_1025, rootElement.lang.security_alarm, "1025", "1075", "securityAlarm", true, true);
        this.fillObject(rootElement.lang.alarm_name_1026, rootElement.lang.security_alarm, "1026", "1076", "securityAlarm", true, true);
        this.fillObject(rootElement.lang.alarm_name_1027, rootElement.lang.security_alarm, "1027", "1077", "securityAlarm", true, true);

    }

    //Platform alarm
    if (!this.isRemovePlatform) {
        this.fillObject(rootElement.lang.alarm_name_301, rootElement.lang.monitor_alarm_platform, "301", "351", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_302, rootElement.lang.monitor_alarm_platform, "302", "352", "platformAlarm", true, true);	//1
        this.fillObject(rootElement.lang.alarm_name_303, rootElement.lang.monitor_alarm_platform, "303", "353", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_305, rootElement.lang.monitor_alarm_platform, "305", "355", "platformAlarm", false, true);	//1

        //Fatigue driving warning
        this.fillObject(rootElement.lang.alarm_name_307, rootElement.lang.monitor_alarm_platform, "307", "357", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_308, rootElement.lang.monitor_alarm_platform, "308", "358", "platformAlarm", false, true);	//1

        this.fillObject(rootElement.lang.alarm_name_310, rootElement.lang.monitor_alarm_platform, "310", "360", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_314, rootElement.lang.over_speed_alarm, "314", "364", "speendAlarm", false, true);	//1
        //Offline warning (generated by the platform)
        this.fillObject(rootElement.lang.alarm_name_140, rootElement.lang.monitor_alarm_platform, "140", null, "platformAlarm", false, true);	//1
        //Overtime driving (generated by the platform)
        this.fillObject(rootElement.lang.alarm_name_145, rootElement.lang.monitor_alarm_platform, "145", null, "platformAlarm", false, true);	//1
        //Driving is prohibited without road orders at night (platform)
        if (rootElement.myUserRole && rootElement.myUserRole.isZSYRoadList()) {
            this.fillObject(rootElement.lang.alarm_name_141, rootElement.lang.monitor_alarm_platform, "141", "142", "platformAlarm", false, true);	//1
        }
        //ACC signal abnormal alarm (platform)
        this.fillObject(rootElement.lang.alarm_name_326, rootElement.lang.monitor_alarm_platform, "326", "376", "platformAlarm", false, true);	//1
        //Location information abnormal alarm (platform)
        this.fillObject(rootElement.lang.alarm_name_327, rootElement.lang.monitor_alarm_platform, "327", "377", "platformAlarm", false, true);	//1
        //Vehicle long-term abnormal offline reminder (platform)
        this.fillObject(rootElement.lang.alarm_name_328, rootElement.lang.monitor_alarm_platform, "328", "378", "platformAlarm", false, true);	//1
        if (rootElement.myUserRole && rootElement.myUserRole.isHaveRole(6)) {
            this.fillObject(rootElement.lang.alarm_name_333, rootElement.lang.monitor_alarm_platform, "333", "383", "platformAlarm", false, true);  //Illegal opening of area (platform)
            this.fillObject(rootElement.lang.alarm_name_332, rootElement.lang.monitor_alarm_platform, "332", "382", "platformAlarm", false, true);  //Illegal opening of area (platform)
            //Regional illegal lifting (platform)
            this.fillObject(rootElement.lang.alarm_name_348, rootElement.lang.monitor_alarm_platform, "348", "398", "platformAlarm", false, true);
        }

        if (!this.isAlarmNoVehicle) {
            //Regional aggregation alarm (platform)
            this.fillObject(rootElement.lang.alarm_name_340, rootElement.lang.monitor_alarm_platform, "340", "390", "platformAlarm", false, true);	//1
            //Hot area warning (platform)
            this.fillObject(rootElement.lang.alarm_name_341, rootElement.lang.monitor_alarm_platform, "341", "391", "platformAlarm", false, true);	//1
            //Hot area alarm (platform)
            this.fillObject(rootElement.lang.alarm_name_342, rootElement.lang.monitor_alarm_platform, "342", "392", "platformAlarm", false, true);	//1
            //Platform collision warning (platform)
            this.fillObject(rootElement.lang.alarm_name_1443, rootElement.lang.monitor_alarm_platform, "1443", "", "platformAlarm", false, true);

        }
        this.fillObject(rootElement.lang.alarm_name_343, rootElement.lang.monitor_alarm_platform, "343", "", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_344, rootElement.lang.monitor_alarm_platform, "344", "", "platformAlarm", false, true);


        //GPS interruption alarm (platform) pamra[0] interruption duration, unit seconds
        this.fillObject(rootElement.lang.alarm_name_1101, rootElement.lang.monitor_alarm_platform, "1101", "", "platformAlarm", false, true);	//1
        //Missed alarm (platform)
        this.fillObject(rootElement.lang.alarm_name_1103, rootElement.lang.monitor_alarm_platform, "1103", "", "platformAlarm", false, true);
        //False alarm (platform)
        this.fillObject(rootElement.lang.alarm_name_1105, rootElement.lang.monitor_alarm_platform, "1105", "", "platformAlarm", false, true);	//1
        //Passing point (platform) param[0]-location type param[1]-key point ID
        this.fillObject(rootElement.lang.alarm_name_1107, rootElement.lang.monitor_alarm_platform, "1107", "", "platformAlarm", false, true);
        //Expiration embargo alarm (platform) param[0]-Expiration type
        this.fillObject(rootElement.lang.alarm_name_544, rootElement.lang.monitor_alarm_platform, "544", "", "platformAlarm", false, true);
        //Expiration reminder time (platform) param[0]-expiration type
        this.fillObject(rootElement.lang.alarm_name_1134, rootElement.lang.monitor_alarm_platform, "1134", "", "platformAlarm", false, true);

        //Regional timeout parking (platform) param[0]-location type param[1]-region or line ID param[2]-parking duration threshold (seconds)
        this.fillObject(rootElement.lang.alarm_name_1312, rootElement.lang.monitor_alarm_platform, "1312", "1362", "platformAlarm", false, true);
        //1314
        this.fillObject(rootElement.lang.alarm_name_1314, rootElement.lang.monitor_alarm_platform, "1314", "1364", "platformAlarm", false, true);
        //Non-key area area aggregation alarm (platform)d
        this.fillObject(rootElement.lang.alarm_name_1313, rootElement.lang.monitor_alarm_platform, "1313", "", "platformAlarm", false, true);
        //Regional gathering warning in non-key areas (platform)
        this.fillObject(rootElement.lang.alarm_name_1347, rootElement.lang.monitor_alarm_platform, "1347", "", "platformAlarm", false, true);
        //Call the police for illegal boarding
        this.fillObject(rootElement.lang.alarm_name_1348, rootElement.lang.monitor_alarm_platform, "1348", "", "platformAlarm", false, true);
        //Call the police for illegal drop-off
        this.fillObject(rootElement.lang.alarm_name_1349, rootElement.lang.monitor_alarm_platform, "1349", "", "platformAlarm", false, true);
        if(rootElement.myUserRole && rootElement.myUserRole.isEpidemicSupport()){
            this.fillObject(rootElement.lang.alarm_name_1430, rootElement.lang.monitor_alarm_platform, "1430", "1480", "platformAlarm", false, true);
            this.fillObject(rootElement.lang.alarm_name_1431, rootElement.lang.monitor_alarm_platform, "1431", "1481", "platformAlarm", false, true);
        }
        //809 connection disconnection alarm (platform)
        this.fillObject(rootElement.lang.alarm_name_329, rootElement.lang.monitor_alarm_platform, "329", "", "platformAlarm", false, true);
        //
        this.fillObject(rootElement.lang.alarm_name_312, rootElement.lang.monitor_alarm_platform, "312", "362", "platformAlarm", false, true);
        //Trajectory discontinuity alarm (platform)
        this.fillObject(rootElement.lang.alarm_name_313, rootElement.lang.monitor_alarm_platform, "313", "363", "platformAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_1113, rootElement.lang.monitor_alarm_platform, "1114", "", "platformAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_1114, rootElement.lang.monitor_alarm_platform, "1113", "", "platformAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_331, rootElement.lang.monitor_alarm_otherAlarm, "331", null, "otherAlarm", false, true);
        // this.fillObject(rootElement.lang.alarm_name_1113, rootElement.lang.monitor_alarm_otherAlarm, "1113", null, "otherAlarm", false, true);
        // this.fillObject(rootElement.lang.alarm_name_1114, rootElement.lang.monitor_alarm_otherAlarm, "1114", null, "otherAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_411, rootElement.lang.monitor_alarm_abnormal, "411", "461", "monitorAlarmAbnormal", false, true);
        this.fillObject(rootElement.lang.alarm_name_412, rootElement.lang.monitor_alarm_abnormal, "412", "462", "monitorAlarmAbnormal", false, true);
        this.fillObject(rootElement.lang.alarm_name_413, rootElement.lang.monitor_alarm_abnormal, "413", "463", "monitorAlarmAbnormal", false, true);
        this.fillObject(rootElement.lang.alarm_name_220, rootElement.lang.monitor_alarm_abnormal, "220", "270", "monitorAlarmAbnormal", false, true);
        this.fillObject(rootElement.lang.alarm_name_221, rootElement.lang.monitor_alarm_abnormal, "221", "271", "monitorAlarmAbnormal", false, true);

        this.fillObject(rootElement.lang.alarm_name_1441, rootElement.lang.monitor_alarm_platform, "1441", "1491", "platformAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_1442, rootElement.lang.monitor_alarm_platform, "1442", "1492", "platformAlarm", false, true);
        //Outage and prohibited traffic alarm (platform)
        this.fillObject(rootElement.lang.alarm_name_1141, rootElement.lang.monitor_alarm_platform, "1141", "", "platformAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_1508, rootElement.lang.monitor_alarm_platform, "1508", null, "platformAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_1514, rootElement.lang.monitor_alarm_platform, "1514", null, "platformAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_1515, rootElement.lang.monitor_alarm_platform, "1515", "1565", "platformAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_1516, rootElement.lang.monitor_alarm_platform, "1516", "1566", "platformAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_1517, rootElement.lang.monitor_alarm_platform, "1517", "1567", "platformAlarm", false, true);
        this.fillObject(rootElement.lang.alarm_name_1142, rootElement.lang.monitor_alarm_platform, "1142", "", "platformAlarm", false, true);



        ///Overspeed alarm level 1 (platform) alarmInfo: overspeed param[0] speed threshold param[1]-alarm speed param[2]-speed threshold
        this.fillObject(rootElement.lang.alarm_name_1502 + rootElement.lang.alarm_name_11111, rootElement.lang.monitor_alarm_platform, "1502", "1552", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1502 + rootElement.lang.alarm_name_22222, rootElement.lang.monitor_alarm_platform, "1503", "1553", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1502 + rootElement.lang.alarm_name_33333, rootElement.lang.monitor_alarm_platform, "1504", "1554", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1502 + rootElement.lang.alarm_name_44444, rootElement.lang.monitor_alarm_platform, "1505", "1555", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1502 + rootElement.lang.alarm_name_55555, rootElement.lang.monitor_alarm_platform, "1506", "1556", "platformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_384, rootElement.lang.monitor_alarm_platform, "384", "", "platformAlarm", false, true);	//1

    }
    //Platform alarm (active safety)
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




        this.fillObject(rootElement.lang.alarm_name_1337 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1337", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1337 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1338", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1337 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1339", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1340 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1340", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1340 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1341", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1340 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1342", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1343 + rootElement.lang.alarm_name_11111, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1343", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1343 + rootElement.lang.alarm_name_22222, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1344", "", "safetyPlatformAlarm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_1343 + rootElement.lang.alarm_name_33333, rootElement.lang.safety + "(" + rootElement.lang.platform + ")", "1345", "", "safetyPlatformAlarm", false, true);	//1

    }
    //active safety equipment
    //Rear approach alarm
    if (!this.isRemoveSafety) {
        //ADAS class
        //Low speed front vehicle collision warning level 1
        this.fillObject(rootElement.lang.alarm_name_840 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "840", "890", "activeSafetyAdas", false, true); //1
        //Low speed front vehicle collision warning level 2
        this.fillObject(rootElement.lang.alarm_name_840 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "841", "891", "activeSafetyAdas", false, true); //1
        //Forward collision warning level 1
        this.fillObject(rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "600", "650", "activeSafetyAdas", false, true);	//1
        //Forward collision warning level 2
        this.fillObject(rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "601", "651", "activeSafetyAdas", false, true);	//1
        //Lane departure warning level 1
        this.fillObject(rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "602", "652", "activeSafetyAdas", false, true);	//1
        //Lane departure warning level 2
        this.fillObject(rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "603", "653", "activeSafetyAdas", false, true);	//1
        //Road sign over-limit alarm level 2
        this.fillObject(rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "610", "660", "activeSafetyAdas", false, true);	//1
        //Road sign over-limit alarm level 1
        this.fillObject(rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "611", "661", "activeSafetyAdas", false, true);	//1
        //Frequent lane changes Level 2
        this.fillObject(rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "608", "658", "activeSafetyAdas", false, true);	//1
        //Frequent lane changes Level 1
        this.fillObject(rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "609", "659", "activeSafetyAdas", false, true);	//1
        //Pedestrian Collision Alarm Level 2
        this.fillObject(rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "606", "656", "activeSafetyAdas", false, true);	//1
        //Pedestrian Collision Alarm Level 1
        this.fillObject(rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "607", "657", "activeSafetyAdas", false, true);	//1
        //Alarm for vehicles too close to each other Level 2
        this.fillObject(rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "604", "654", "activeSafetyAdas", false, true);	//1
        //Alarm for vehicles too close to each other Level 1
        this.fillObject(rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "605", "655", "activeSafetyAdas", false, true);	//1
        //Obstacle alarm level 2
        this.fillObject(rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "612", "662", "activeSafetyAdas", false, true);	//1
        //Obstacle alarm level 1
        this.fillObject(rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "613", "663", "activeSafetyAdas", false, true);	//1
        //Curved speed warning level 1
        this.fillObject(rootElement.lang.alarm_name_700 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "700", "750", "activeSafetyAdas", false, true);	//1
        //Curved speed warning level 2
        this.fillObject(rootElement.lang.alarm_name_700 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "701", "751", "activeSafetyAdas", false, true);	//1
        //
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
        this.fillObject(rootElement.lang.alarm_name_1439 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "1439", "1489", "activeSafetyAdas", false, true); //1
        this.fillObject(rootElement.lang.alarm_name_1439 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "1440", "1490", "activeSafetyAdas", false, true); //1

        //Black car alarm
        this.fillObject(rootElement.lang.alarm_name_530 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "530", "580", "activeSafetyAdas", false, true);
        this.fillObject(rootElement.lang.alarm_name_530 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "531", "581", "activeSafetyAdas", false, true);
        this.fillObject(rootElement.lang.alarm_name_532 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "532", "582", "activeSafetyAdas", false, true);
        this.fillObject(rootElement.lang.alarm_name_532 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "533", "583", "activeSafetyAdas", false, true);
        this.fillObject(rootElement.lang.alarm_name_534 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "534", "584", "activeSafetyAdas", false, true);
        this.fillObject(rootElement.lang.alarm_name_534 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "535", "585", "activeSafetyAdas", false, true);
        this.fillObject(rootElement.lang.alarm_name_536 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "536", "586", "activeSafetyAdas", false, true);
        this.fillObject(rootElement.lang.alarm_name_536 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "537", "587", "activeSafetyAdas", false, true);

        if (!hideEvent) {
            //Active capture event level 2
            this.fillObject(rootElement.lang.alarm_name_616 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "616", null, "activeSafetyAdas", false, true);	//1
            //Active capture event level 1
            this.fillObject(rootElement.lang.alarm_name_616 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "617", null, "activeSafetyAdas", false, true);	//1
            //Road sign recognition incident level 2
            this.fillObject(rootElement.lang.alarm_name_614 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "614", null, "activeSafetyAdas", false, true);	//1
            //Road Sign Recognition Incident Level 1
            this.fillObject(rootElement.lang.alarm_name_614 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "615", null, "activeSafetyAdas", false, true);	//1
        }

        //DSM class
        //Smoking alarm level 2
        this.fillObject(rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "622", "672", "activeSafetyDsm", false, true);	//1
        //Smoking alarm level 1
        this.fillObject(rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "623", "673", "activeSafetyDsm", false, true);	//1
        //Call the police Level 2
        this.fillObject(rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "620", "670", "activeSafetyDsm", false, true);	//1
        //Call the police Level 1
        this.fillObject(rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "621", "671", "activeSafetyDsm", false, true);	//1

        //Fatigue driving alarm level 2
        this.fillObject(rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "618", "668", "activeSafetyDsm", false, true);	//1
        //Fatigue driving alarm level 1
        this.fillObject(rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "619", "669", "activeSafetyDsm", false, true);	//1
        //Driver abnormality alarm level 2
        this.fillObject(rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "626", "676", "activeSafetyDsm", false, true);	//1
        //Driver abnormality alarm level 1
        this.fillObject(rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "627", "677", "activeSafetyDsm", false, true);	//1

        //Distracted driving alarm level 2
        this.fillObject(rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "624", "674", "activeSafetyDsm", false, true);	//1
        //Distracted driving alarm level 1
        this.fillObject(rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "625", "675", "activeSafetyDsm", false, true);	//1
        //If you fail to look ahead for a long time, the alarm will be level 1.
        this.fillObject(rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "702", "752", "activeSafetyDsm", false, true);	//1
        //If you fail to look ahead for a long time, the alarm will be level 2.
        this.fillObject(rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "703", "753", "activeSafetyDsm", false, true);	//1
        //The system cannot work properly and alarm level 1
        this.fillObject(rootElement.lang.alarm_name_704 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "704", "754", "activeSafetyDsm", false, true);	//1
        //The system cannot work properly and alarm level 2
        this.fillObject(rootElement.lang.alarm_name_704 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "705", "755", "activeSafetyDsm", false, true);	//1
        //Level 1 alarm for driver not wearing a seat belt
        this.fillObject(rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "706", "756", "activeSafetyDsm", false, true);	//1
        //Level 2 alarm for driver not wearing seat belt
        this.fillObject(rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "707", "757", "activeSafetyDsm", false, true);	//1

        //Alarm level 1 when the driver is not in the driving seat
        this.fillObject(rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "708", "758", "activeSafetyDsm", false, true);	//1
        //Level 2 alarm when the driver is not in the driving seat
        this.fillObject(rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "709", "759", "activeSafetyDsm", false, true);	//1
        //Level 1 alarm occurs when the driver takes his hands off the steering wheel
        this.fillObject(rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "710", "760", "activeSafetyDsm", false, true);	//1
        //Level 2 alarm occurs when the driver takes his hands off the steering wheel
        this.fillObject(rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "711", "761", "activeSafetyDsm", false, true);	//1
        //
        this.fillObject(rootElement.lang.alarm_name_644 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "644", "694", "activeSafetyDsm", false, true);	//1
        //
        this.fillObject(rootElement.lang.alarm_name_644 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "645", "695", "activeSafetyDsm", false, true);	//1
//		if(!enableSubiao()){
        //Driver IC card abnormal alarm level 1
        this.fillObject(rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "641", "691", "activeSafetyDsm", false, true);	//1
        //Driver IC card abnormal alarm level 2
        this.fillObject(rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "642", "692", "activeSafetyDsm", false, true);	//1
        //driver identification incident
        /*  if (!hideEvent) {
              this.fillObject(rootElement.lang.alarm_name_643, rootElement.lang.abnormality, "643", null, "activeSafetyDsm", false, true);	//1
          }*/
//        }
        //
        this.fillObject(rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "717", "767", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "718", "768", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_719, rootElement.lang.abnormality, "719", null, "activeSafetyDsm", false, true);	//1
        //DSM (elsewhere)
        this.fillObject(rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "734", "784", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "735", "785", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "736", "786", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "737", "787", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "738", "788", "activeSafetyDsm", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "739", "789", "activeSafetyDsm", false, true);	//1
//		if(rootElement.myUserRole && rootElement.myUserRole.isIsSunglassFailure()){
        //Level 1 alarm for sunglasses failure
        this.fillObject(rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "639", "689", "activeSafetyDsm", false, true);	//1
        //Sunglasses failure level 2 alarm
        this.fillObject(rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "640", "690", "activeSafetyDsm", false, true);	//1
//		}
        //Take one hand off the steering wheel
        this.fillObject(rootElement.lang.alarm_name_745 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "745", "795", "activeSafetyDsm", false, true);
        this.fillObject(rootElement.lang.alarm_name_745 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "746", "796", "activeSafetyDsm", false, true);
        if (!hideEvent) {
            //Driver Change Event Level 2
            this.fillObject(rootElement.lang.alarm_name_630 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "630", null, "activeSafetyDsm", false, true);	//1
            //Driver Change Event Level 1
            this.fillObject(rootElement.lang.alarm_name_630 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "631", null, "activeSafetyDsm", false, true);	//1
            //Automatic capture event level 2
            this.fillObject(rootElement.lang.alarm_name_628 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "628", null, "activeSafetyDsm", false, true);	//1
            //Automatic capture event level 1
            this.fillObject(rootElement.lang.alarm_name_628 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "629", null, "activeSafetyDsm", false, true);	//1
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


        //tmps tire pressure
        //tire pressure alarm
        this.fillObject(rootElement.lang.alarm_name_632, rootElement.lang.tmps, "632", "682", "activeSafetyTmps", false, true);	//1
        //BDS proximity alarm
        //Rear approach alarm
        this.fillObject(rootElement.lang.alarm_name_633, rootElement.lang.proximity, "633", "683", "activeSafetyProximity", false, true);	//1
        //Left rear proximity alarm
        this.fillObject(rootElement.lang.alarm_name_634, rootElement.lang.proximity, "634", "684", "activeSafetyProximity", false, true);	//1
        //Right rear proximity alarm
        this.fillObject(rootElement.lang.alarm_name_635, rootElement.lang.proximity, "635", "685", "activeSafetyProximity", false, true);	//1
        //Aggressive driving
        //Intense driving alarm (Sichuan standard)
        this.fillObject(rootElement.lang.alarm_name_720, rootElement.lang.fierce_driving_type, "720", "770", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_721, rootElement.lang.fierce_driving_type, "721", "771", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_722, rootElement.lang.fierce_driving_type, "722", "772", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_723, rootElement.lang.fierce_driving_type, "723", "773", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_724, rootElement.lang.fierce_driving_type, "724", "774", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_725, rootElement.lang.fierce_driving_type, "725", "775", "activeSafetyFierce", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_726, rootElement.lang.fierce_driving_type, "726", "776", "activeSafetyFierce", false, true);	//1

        //Intelligent detection
        this.fillObject(rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_11111, rootElement.lang.znjc, "740", "790", "activeSafetyZnjc", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_22222, rootElement.lang.znjc, "741", "791", "activeSafetyZnjc", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_11111, rootElement.lang.znjc, "742", "792", "activeSafetyZnjc", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_22222, rootElement.lang.znjc, "743", "793", "activeSafetyZnjc", false, true);	//1

        //Satellite positioning alarm (Sichuan standard)
        this.fillObject(rootElement.lang.alarm_name_727, rootElement.lang.satellite_positioning_type, "727", "777", "activeSafetySatellite", false, true);	//1
        this.fillObject(rootElement.lang.alarm_name_744, rootElement.lang.satellite_positioning_type, "744", "794", "activeSafetySatellite", false, true);	//1

        //Heilongjiang
        this.addHeiLongJiangAlarm();
        //Hunan (Hunan standard)
        this.addHuNanAlarm();
        //Active safety for dump trucks
        this.addMuckAlarm();
        this.addJiangSuAlarm();
        //Beijing proactive security
        this.addBeiJingAlarm();
        //Drink test
        this.addWineTestAlarm();
        //Sichuan
        this.addSiChuanAlarm();
        //Shanghai
        this.addShangHaiAlarm();
        //Active safety other alarms
        this.addSchoolAlarm();
        this.fillObject(rootElement.lang.alarm_name_982, rootElement.lang.abnormality, "982", "1032", "activeSafetyDsm", false, true);	//1

    }
    //GSensor starts
    this.fillObject(rootElement.lang.alarm_name_439, rootElement.lang.alarm_GSensor_type, "439", "489", "gSensor", false, true);
    //GSensorStop
    this.fillObject(rootElement.lang.alarm_name_440, rootElement.lang.alarm_GSensor_type, "440", "490", "gSensor", false, true);
    //GSensor rollover
    this.fillObject(rootElement.lang.alarm_name_441, rootElement.lang.alarm_GSensor_type, "441", "491", "gSensor", false, true);
    this.fillObject(rootElement.lang.alarm_name_246, rootElement.lang.alarm_GSensor_type, "246", "296", "gSensor", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_247, rootElement.lang.alarm_GSensor_type, "247", "297", "gSensor", false, true);	//1
    //Collision rollover
    this.fillObject(rootElement.lang.alarm_name_219, rootElement.lang.alarm_GSensor_type, "219", "269", "gSensor", false, true);	//1
    //sharp turn
    this.fillObject(rootElement.lang.alarm_name_444, rootElement.lang.alarm_GSensor_type, "444", "494", "gSensor", false, true);
    //Alarm on and off line
    this.fillObject(rootElement.lang.alarm_name_17, rootElement.lang.monitor_alarm_login, "17", null, "loginAlarm", true, true);	//1
    //Offline alarm
    this.fillObject(rootElement.lang.alarm_name_67, rootElement.lang.monitor_alarm_login, "67", null, "loginAlarm", true, true);	//1

    //Dump truck related alarms
    //For alarms related to muck trucks, the alarm end type is added to the start type by 50. The alarm end definition is not added here.
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


    //New alarm protocol for muck trucks
    this.addMuckAlarm(1);

    //Black car alarm level 1
    /*this.fillObject(rootElement.lang.alarm_name_530, rootElement.lang.muck_alarm, "530", "580", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_532, rootElement.lang.muck_alarm, "532", "582", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_534, rootElement.lang.muck_alarm, "534", "584", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_536, rootElement.lang.muck_alarm, "536", "586", "muckAlarm", false, true);
*/
    //Black car alarm level 2
    /*this.fillObject(rootElement.lang.alarm_name_530, rootElement.lang.muck_alarm, "531", "581", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_532, rootElement.lang.muck_alarm, "533", "583", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_534, rootElement.lang.muck_alarm, "535", "585", "muckAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_536, rootElement.lang.muck_alarm, "537", "587", "muckAlarm", false, true);
*/
    //Electronic lock alarm
    this.addLockAlarm();
    //Shanghai 809 alarm  decheng 809 alarm
    if (rootElement.myUserRole && (rootElement.myUserRole.isEnableShangHai809() || rootElement.myUserRole.isEnableDeCheng809())){
        this.addShangHaiOrDecheng809Alarm();
    }

    //ADAS alarm monitor_alarm_adas
    //Front collision warning
    this.fillObject(rootElement.lang.alarm_name_400, rootElement.lang.monitor_alarm_adas, "400", "450", "adasAlarm", false, true);	//1
    //road departure warning
    this.fillObject(rootElement.lang.alarm_name_401, rootElement.lang.monitor_alarm_adas, "401", "451", "adasAlarm", false, true);	//1
    //Pedestrian detection warning
    this.fillObject(rootElement.lang.alarm_name_402, rootElement.lang.monitor_alarm_adas, "402", "452", "adasAlarm", false, true);	//1
    //Close distance between cars
    this.fillObject(rootElement.lang.alarm_name_406, rootElement.lang.monitor_alarm_adas, "406", "456", "adasAlarm", false, true);	//1
    //brake suddenly
    this.fillObject(rootElement.lang.alarm_name_407, rootElement.lang.monitor_alarm_adas, "407", "457", "adasAlarm", false, true);	//1
    //sharp left turn
    this.fillObject(rootElement.lang.alarm_name_408, rootElement.lang.monitor_alarm_adas, "408", "458", "adasAlarm", false, true);	//1
    //sharp right turn
    this.fillObject(rootElement.lang.alarm_name_409, rootElement.lang.monitor_alarm_adas, "409", "459", "adasAlarm", false, true);	//1
    //Tire pressure alarm (ADAS)
    this.fillObject(rootElement.lang.alarm_name_168, rootElement.lang.monitor_alarm_adas, "168", "169", "adasAlarm", false, true);	//1
    //Hitting Pedestrian Customized in Xinjiang
//	this.fillObject(rootElement.lang.impacting_pedestrians, rootElement.lang.monitor_alarm_adas, "421", "471", "adasAlarm",false,true);	//1
    //The driver is blocking or the camera is out of position
    this.fillObject(rootElement.lang.alarm_name_403, rootElement.lang.monitor_alarm_adas, "403", "453", "adasAlarm", false, true);	//1
    //Warning oriented
    this.fillObject(rootElement.lang.alarm_name_170, rootElement.lang.monitor_alarm_adas, "170", "171", "adasAlarm", false, true);	//1
    //Not wearing seat belt
    this.fillObject(rootElement.lang.alarm_name_404, rootElement.lang.monitor_alarm_adas, "404", "454", "adasAlarm", false, true);	//1
    //bow your head
    this.fillObject(rootElement.lang.alarm_name_410, rootElement.lang.monitor_alarm_adas, "410", "460", "adasAlarm", false, true);	//1

    //glance right and left
    this.fillObject(rootElement.lang.alarm_name_188, rootElement.lang.monitor_alarm_adas, "188", "189", "adasAlarm", false, true);	//1
    //yawn
    this.fillObject(rootElement.lang.alarm_name_190, rootElement.lang.monitor_alarm_adas, "190", "191", "adasAlarm", false, true);	//1
    if (rootElement.myUserRole && !rootElement.myUserRole.isShieldReport()) {
        //Mobile phone alert
        this.fillObject(rootElement.lang.alarm_name_174, rootElement.lang.monitor_alarm_adas, "174", "175", "adasAlarm", false, true);	//1
        //Smoking warning
        this.fillObject(rootElement.lang.alarm_name_176, rootElement.lang.monitor_alarm_adas, "176", "177", "adasAlarm", false, true);	//1
    }
    //Close eyes warning
    this.fillObject(rootElement.lang.alarm_name_172, rootElement.lang.monitor_alarm_adas, "172", "173", "adasAlarm", false, true);	//1
    //Leave the post
    this.fillObject(rootElement.lang.alarm_name_186, rootElement.lang.monitor_alarm_adas, "186", "187", "adasAlarm", false, true);	//1
    //Facial fatigue
    this.fillObject(rootElement.lang.alarm_name_249, rootElement.lang.monitor_alarm_adas, "249", "299", "adasAlarm", false, true);	//1


    //forward collision warning
    this.fillObject(rootElement.lang.alarm_name_430, rootElement.lang.monitor_alarm_adas, "430", "480", "adasAlarm", false, true);
    //Lane departure warning
    this.fillObject(rootElement.lang.alarm_name_431, rootElement.lang.monitor_alarm_adas, "431", "481", "adasAlarm", false, true);
    //Tire pressure warning
    this.fillObject(rootElement.lang.alarm_name_432, rootElement.lang.monitor_alarm_adas, "432", "482", "adasAlarm", false, true);
    //Rollover warning
    this.fillObject(rootElement.lang.alarm_name_433, rootElement.lang.monitor_alarm_adas, "433", "483", "adasAlarm", false, true);
    //Driving illegally
    this.fillObject(rootElement.lang.alarm_name_713, rootElement.lang.monitor_alarm_adas, "713", "763", "adasAlarm", false, true);
    //Right turn blind spot abnormality alarm
    this.fillObject(rootElement.lang.alarm_name_714, rootElement.lang.monitor_alarm_adas, "714", "764", "adasAlarm", false, true);
    //Sharp bend/S bend alarm
    this.fillObject(rootElement.lang.alarm_name_446_default, rootElement.lang.monitor_alarm_adas, "446", "496", "adasAlarm", false, true);	//1
    //Violent jolts
    this.fillObject(rootElement.lang.alarm_name_447_default, rootElement.lang.monitor_alarm_adas, "447", "497", "adasAlarm", false, true);	//1
}

AlarmManager.prototype.addDailySummary = function () {
    this.fillObject(rootElement.lang.alarm_name_428, rootElement.lang.over_speed_alarm, "428", "478", "speendAlarm", false, true);   //1
    //Custom alarm 1
    this.fillObject(rootElement.lang.alarm_name_1, rootElement.lang.monitor_alarm_otherAlarm, "1", "", "otherAlarm", false, true);   //1
    //Emergency button alarm 2
    this.fillObject(rootElement.lang.alarm_name_2, rootElement.lang.monitor_alarm_operate, "2", "52", "operateAlarm", true, true);
    //Regional speed alarm 200
    this.fillObject(rootElement.lang.alarm_name_200, rootElement.lang.over_speed_alarm, "200", "250", "speendAlarm", false, true);  //1
    //Dangerous Driving Behavior Alert 201
    this.fillObject(rootElement.lang.alarm_name_201, rootElement.lang.monitor_alarm_otherAlarm, "201", "251", "otherAlarm", false, true);  //1
    //gnss module failure alarm      202
    this.fillObject(rootElement.lang.alarm_name_202, rootElement.lang.monitor_alarm_fault, "202", "252", "faultAlarm", false, true);  //1
    //GNSS antenna is not connected or cut off 203
    this.fillObject(rootElement.lang.alarm_name_203, rootElement.lang.monitor_alarm_fault, "203", "253", "faultAlarm", false, true); //1
    //GNSS antenna short circuit 204
    this.fillObject(rootElement.lang.alarm_name_204, rootElement.lang.monitor_alarm_fault, "204", "254", "faultAlarm", false, true);   //1
    //Power undervoltage 205
    this.fillObject(rootElement.lang.alarm_name_205, rootElement.lang.monitor_alarm_otherAlarm, "205", "255", "otherAlarm", false, true);    //1
    //Power failure 206
    this.fillObject(rootElement.lang.alarm_name_206, rootElement.lang.monitor_alarm_otherAlarm, "206", "256", "otherAlarm", false, true);  //1
    //Terminal LCD or display failure 207
    this.fillObject(rootElement.lang.alarm_name_207, rootElement.lang.monitor_alarm_fault, "207", "257", "faultAlarm", false, true);    //1
    //TTS module failure 208
    this.fillObject(rootElement.lang.alarm_name_208, rootElement.lang.monitor_alarm_fault, "208", "258", "faultAlarm", false, true);   //1
    //Camera failure 209
    this.fillObject(rootElement.lang.alarm_name_209, rootElement.lang.monitor_alarm_fault, "209", "259", "faultAlarm", false, true);  //1
    //Total driving time exceeded 210
    this.fillObject(rootElement.lang.alarm_name_210, rootElement.lang.monitor_alarm_otherAlarm, "210", "260", "otherAlarm", false, true);   //1
    //Alarm when parking too long 14
    this.fillObject(rootElement.lang.alarm_name_14, rootElement.lang.monitor_alarm_otherAlarm, "14", "64", "otherAlarm", false, true); //1
    //Entry and exit area 211
    this.fillObject(rootElement.lang.alarm_name_211, rootElement.lang.monitor_alarm_fence, "211", "261", "fenceAlarm", true, true);   //1
    //In and out route alarm 212
    this.fillObject(rootElement.lang.alarm_name_212, rootElement.lang.monitor_alarm_fence, "212", "262", "fenceAlarm", false, true);  //1
    //Road section travel time is too long/too short 213
    this.fillObject(rootElement.lang.alarm_name_213, rootElement.lang.monitor_alarm_fence, "213", "263", "fenceAlarm", false, true);  //1
    //Route Departure Alarm 214
    this.fillObject(rootElement.lang.alarm_name_214, rootElement.lang.monitor_alarm_fence, "214", "264", "fenceAlarm", false, true); //1
    //Vehicle VSS failure 215
    this.fillObject(rootElement.lang.alarm_name_215, rootElement.lang.monitor_alarm_fault, "215", "265", "faultAlarm", false, true); //1
    //Vehicle oil level abnormality alarm 216
    this.fillObject(rootElement.lang.alarm_name_216, rootElement.lang.monitor_alarm_fuel, "216", "266", "fuelAlarm", false, true); //1
    //Vehicle stolen alarm 217
    this.fillObject(rootElement.lang.alarm_name_217, rootElement.lang.monitor_alarm_otherAlarm, "217", "267", "otherAlarm", false, true);   //1
    //Vehicle illegal ignition alarm 8
    this.fillObject(rootElement.lang.alarm_name_8, rootElement.lang.monitor_alarm_otherAlarm, "8", "58", "otherAlarm", false, true);  //1
    //Illegal vehicle movement alarm 218
    this.fillObject(rootElement.lang.alarm_name_218, rootElement.lang.monitor_alarm_otherAlarm, "218", "268", "otherAlarm", false, true);   //1
    //Collision and rollover alarm 219
    this.fillObject(rootElement.lang.alarm_name_219, rootElement.lang.alarm_GSensor_type, "219", "269", "gSensor", false, true);   //1
    //Night driving alarm 151
    this.fillObject(rootElement.lang.alarm_name_151, rootElement.lang.monitor_alarm_platform, "151", "152", "offlineEarlyMorningAlarm", false, true); //1
    //Speed ​​alarm 11
    this.fillObject(rootElement.lang.alarm_name_11, rootElement.lang.over_speed_alarm, "11", "61", "speendAlarm", false, true);    //1
    //Illegal door opening alarm 6
    this.fillObject(rootElement.lang.alarm_name_6, rootElement.lang.monitor_alarm_operate, "6", "56", "operateAlarm", false, true); //1
    //Regional speed alarm (generated by the platform) 300
    this.fillObject(rootElement.lang.alarm_name_300, rootElement.lang.over_speed_alarm, "300", "350", "speendAlarm", false, true);   //1
    //Regional low speed alarm (generated by the platform) 301
    this.fillObject(rootElement.lang.alarm_name_301, rootElement.lang.monitor_alarm_platform, "301", "351", "platformAlarm", false, true);    //1
    //Entering and exiting the area (generated by the platform) 302
    this.fillObject(rootElement.lang.alarm_name_302, rootElement.lang.monitor_alarm_platform, "302", "352", "platformAlarm", true, true);    //1
    //Line offset (generated by platform) 303
    this.fillObject(rootElement.lang.alarm_name_303, rootElement.lang.monitor_alarm_platform, "303", "353", "platformAlarm", false, true);   //1
    //Time period overspeed alarm (generated by the platform) 304
    this.fillObject(rootElement.lang.alarm_name_304, rootElement.lang.over_speed_alarm, "304", "354", "speendAlarm", false, true);   //1
    //Low speed alarm during time period (generated by platform) 305
    this.fillObject(rootElement.lang.alarm_name_305, rootElement.lang.monitor_alarm_platform, "305", "355", "platformAlarm", false, true);    //1
    //Cumulative fatigue (platform)
    this.fillObject(rootElement.lang.alarm_name_1121, rootElement.lang.fatigueAlarm, "1121", null, "tiredAlarm", false, true);
    //daytime fatigue
    this.fillObject(rootElement.lang.alarm_name_1126, rootElement.lang.fatigueAlarm, "1126", null, "tiredAlarm", false, true);
    //night fatigue
    this.fillObject(rootElement.lang.alarm_name_1127, rootElement.lang.fatigueAlarm, "1127", null, "tiredAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1031, rootElement.lang.fatigueAlarm, "1031", null, "tiredAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1032, rootElement.lang.fatigueAlarm, "1032", null, "tiredAlarm", false, true);
    //Daytime Fatigue (Platform)
    //Passenger vehicles prohibited
    this.fillObject(rootElement.lang.alarm_name_220, rootElement.lang.monitor_alarm_platform, "220", null, "platformAlarm", false, true);
    //Prohibited on mountain roads
    this.fillObject(rootElement.lang.alarm_name_221, rootElement.lang.monitor_alarm_platform, "221", null, "platformAlarm", false, true);
    //Bus overcrowding alarm
    this.fillObject(rootElement.lang.alarm_name_231, rootElement.lang.monitor_alarm_platform, "231", null, "platformAlarm", false, true);
    //Fatigue driving warning (platform) 1109
    this.fillObject(rootElement.lang.alarm_name_1109, rootElement.lang.fatigueAlarm, "1109", null, "tiredAlarm", false, true);  //1
    //Drowsy driving (generated by the platform) 306
    this.fillObject(rootElement.lang.alarm_name_306_default, rootElement.lang.fatigueAlarm, "306", "356", "tiredAlarm", false, true);  //1
    //Timeout parking (generated by the platform) 307
    this.fillObject(rootElement.lang.alarm_name_307, rootElement.lang.monitor_alarm_platform, "307", "357", "platformAlarm", false, true); //1
    //Key point monitoring alarm (generated by the platform) 308
    this.fillObject(rootElement.lang.alarm_name_308, rootElement.lang.monitor_alarm_platform, "308", "358", "platformAlarm", false, true);   //1
    //Line speed alarm (generated by the platform) 309
    this.fillObject(rootElement.lang.alarm_name_309, rootElement.lang.over_speed_alarm, "309", "359", "speendAlarm", false, true);   //1
    //Line low speed alarm (generated by the platform) 310
    this.fillObject(rootElement.lang.alarm_name_310, rootElement.lang.monitor_alarm_platform, "310", "360", "platformAlarm", false, true);    //1
    //Road level speed alarm (generated by the platform) 311
    this.fillObject(rootElement.lang.alarm_name_311, rootElement.lang.over_speed_alarm, "311", "361", "speendAlarm", false, true);    //1
    //Road grade speed warning (generated by the platform) 1333
    this.fillObject(rootElement.lang.alarm_name_1333, rootElement.lang.over_speed_alarm, "1333", null, "speendAlarm", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_1508, rootElement.lang.monitor_alarm_platform, "1508", null, "platformAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1514, rootElement.lang.monitor_alarm_platform, "1514", null, "platformAlarm", false, true);

    //Drowsy driving 49
    this.fillObject(rootElement.lang.alarm_name_49, rootElement.lang.fatigueAlarm, "49", "99", "tiredAlarm", false, true);    //1
    //Speeding at night (generated by platform) 314
    this.fillObject(rootElement.lang.alarm_name_314, rootElement.lang.over_speed_alarm, "314", "364", "speendAlarm", false, true); //1
    //TODO police statistics
    this.fillObject(rootElement.lang.alarm_name_712, rootElement.lang.monitor_alarm_fault, "712", "762", "faultAlarm", false, true);    //1
    //Fatigue driving warning
    this.fillObject(rootElement.lang.alarm_name_429, rootElement.lang.fatigueAlarm, "429", "479", "tiredAlarm", false, true);
    //ACC signal abnormal alarm (platform)
    this.fillObject(rootElement.lang.alarm_name_326, rootElement.lang.monitor_alarm_platform, "326", "376", "platformAlarm", false, true); //1
    //Location information abnormal alarm (platform)
    this.fillObject(rootElement.lang.alarm_name_327, rootElement.lang.monitor_alarm_platform, "327", "377", "platformAlarm", false, true); //1
    //Vehicle long-term abnormal offline reminder (platform)
    this.fillObject(rootElement.lang.alarm_name_328, rootElement.lang.monitor_alarm_platform, "328", "378", "platformAlarm", false, true);  //1
    //Offline displacement 136
    this.fillObject(rootElement.lang.alarm_name_136, rootElement.lang.offline_early_morning_alarm, "136", "", "offlineEarlyMorningAlarm", false, true);   //1

    this.fillObject(rootElement.lang.alarm_name_1319, rootElement.lang.fatigueAlarm, "1319", null, "tiredAlarm", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_1320, rootElement.lang.fatigueAlarm, "1320", null, "tiredAlarm", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_1321, rootElement.lang.fatigueAlarm, "1321", null, "tiredAlarm", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_1322, rootElement.lang.fatigueAlarm, "1322", null, "tiredAlarm", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_1323, rootElement.lang.fatigueAlarm, "1323", null, "tiredAlarm", false, true);    //1

    this.fillObject(rootElement.lang.alarm_name_1315, rootElement.lang.over_speed_alarm, "1315", "1365", "speendAlarm", false, true);//超速报警一级(平台)
    this.fillObject(rootElement.lang.alarm_name_1316, rootElement.lang.over_speed_alarm, "1316", "1366", "speendAlarm", false, true);//超速报警二级(平台)
    this.fillObject(rootElement.lang.alarm_name_1317, rootElement.lang.over_speed_alarm, "1317", "1367", "speendAlarm", false, true);//超速报警三级(平台)
    this.fillObject(rootElement.lang.alarm_name_1318, rootElement.lang.over_speed_alarm, "1318", "1368", "speendAlarm", false, true);//超速报警四级(平台)
    this.fillObject(rootElement.lang.alarm_name_1346, rootElement.lang.over_speed_alarm, "1346", "1396", "speendAlarm", false, true);//超速报警五级(平台)

    this.fillObject(rootElement.lang.alarm_name_1502 + rootElement.lang.alarm_name_11111, rootElement.lang.monitor_alarm_platform, "1502", "1552", "platformAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1502 + rootElement.lang.alarm_name_22222, rootElement.lang.monitor_alarm_platform, "1503", "1553", "platformAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1502 + rootElement.lang.alarm_name_33333, rootElement.lang.monitor_alarm_platform, "1504", "1554", "platformAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1502 + rootElement.lang.alarm_name_44444, rootElement.lang.monitor_alarm_platform, "1505", "1555", "platformAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1502 + rootElement.lang.alarm_name_55555, rootElement.lang.monitor_alarm_platform, "1506", "1556", "platformAlarm", false, true);	//1

    this.fillObject(rootElement.lang.alarm_name_1334 + rootElement.lang.alarm_name_11111, rootElement.lang.offline_early_morning_alarm,  "1334","1384", "offlineEarlyMorningAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1334 + rootElement.lang.alarm_name_22222, rootElement.lang.offline_early_morning_alarm,  "1335","1385", "offlineEarlyMorningAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1334 + rootElement.lang.alarm_name_33333, rootElement.lang.offline_early_morning_alarm,  "1336","1386", "offlineEarlyMorningAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1334 + rootElement.lang.alarm_name_44444, rootElement.lang.offline_early_morning_alarm,  "1500","1550", "offlineEarlyMorningAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1334 + rootElement.lang.alarm_name_55555, rootElement.lang.offline_early_morning_alarm,  "1501","1551", "offlineEarlyMorningAlarm", false, true);	//1


    this.fillObject(rootElement.lang.alarm_name_1314, rootElement.lang.monitor_alarm_platform, "1314", null, "platformAlarm", false, true);  //1


    //ADAS class
    //Forward collision warning level 1
    this.fillObject(rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "600", "650", "activeSafetyAdas", false, true); //1
    //Forward collision warning level 2
    this.fillObject(rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "601", "651", "activeSafetyAdas", false, true); //1
    //Lane departure warning level 1
    this.fillObject(rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "602", "652", "activeSafetyAdas", false, true); //1
    //Lane departure warning level 2
    this.fillObject(rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "603", "653", "activeSafetyAdas", false, true); //1
    //Alarm for vehicles too close to each other Level 1
    this.fillObject(rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "604", "654", "activeSafetyAdas", false, true); //1
    //Alarm for vehicles too close to each other Level 2
    this.fillObject(rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "605", "655", "activeSafetyAdas", false, true); //1
    //Pedestrian Collision Alarm Level 1
    this.fillObject(rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "606", "656", "activeSafetyAdas", false, true); //1
    //Pedestrian Collision Alarm Level 2
    this.fillObject(rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "607", "657", "activeSafetyAdas", false, true); //1
    //Frequent lane changes Level 1
    this.fillObject(rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "608", "658", "activeSafetyAdas", false, true); //1
    //Frequent lane changes Level 2
    this.fillObject(rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "609", "659", "activeSafetyAdas", false, true); //1
    //Road sign over-limit alarm level 1
    this.fillObject(rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "610", "660", "activeSafetyAdas", false, true); //1
    //Road sign over-limit alarm level 2
    this.fillObject(rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "611", "661", "activeSafetyAdas", false, true); //1
    //Obstacle alarm level 1
    this.fillObject(rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "612", "662", "activeSafetyAdas", false, true); //1
    //Obstacle alarm level 2
    this.fillObject(rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "613", "663", "activeSafetyAdas", false, true); //1
    //Curved speed warning level 1
    this.fillObject(rootElement.lang.alarm_name_700 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "700", "750", "activeSafetyAdas", false, true); //1
    //Curved speed warning level 2
    this.fillObject(rootElement.lang.alarm_name_700 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "701", "751", "activeSafetyAdas", false, true); //1
    //715
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
    //Fatigue driving alarm level 1
    this.fillObject(rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "618", "668", "activeSafetyDsm", false, true);
    //Fatigue driving alarm level 2
    this.fillObject(rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "619", "669", "activeSafetyDsm", false, true);
    //Call the police Level 1
    this.fillObject(rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "620", "670", "activeSafetyDsm", false, true); //1
    //Call the police Level 2
    this.fillObject(rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "621", "671", "activeSafetyDsm", false, true); //1
    //Smoking alarm level 1
    this.fillObject(rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "622", "672", "activeSafetyDsm", false, true); //1
    //Smoking alarm level 2
    this.fillObject(rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "623", "673", "activeSafetyDsm", false, true); //1
    //Distracted driving alarm level 1
    this.fillObject(rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "624", "674", "activeSafetyDsm", false, true); //1
    //Distracted driving alarm level 2
    this.fillObject(rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "625", "675", "activeSafetyDsm", false, true); //1
    //Driver abnormality alarm level 1
    this.fillObject(rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "626", "676", "activeSafetyDsm", false, true); //1
    //Driver abnormality alarm level 2
    this.fillObject(rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "627", "677", "activeSafetyDsm", false, true); //1
    //Level 1 alarm for sunglasses failure
    this.fillObject(rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "639", "689", "activeSafetyDsm", false, true); //1
    //Sunglasses failure level 2 alarm
    this.fillObject(rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "640", "690", "activeSafetyDsm", false, true); //1
    //Driver IC card abnormal alarm level 1
    this.fillObject(rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "641", "691", "activeSafetyDsm", false, true); //1
    //Driver IC card abnormal alarm level 2
    this.fillObject(rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "642", "692", "activeSafetyDsm", false, true); //1
    //
    this.fillObject(rootElement.lang.alarm_name_644 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "644", "694", "activeSafetyDsm", false, true); //1
    //
    this.fillObject(rootElement.lang.alarm_name_644 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "645", "695", "activeSafetyDsm", false, true); //1
    //Take one hand off the steering wheel
    this.fillObject(rootElement.lang.alarm_name_745 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "745", "795", "activeSafetyDsm", false, true);
    this.fillObject(rootElement.lang.alarm_name_745 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "746", "796", "activeSafetyDsm", false, true);
    //If you fail to look ahead for a long time, the alarm will be level 1.
    this.fillObject(rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "702", "752", "activeSafetyDsm", false, true); //1
    //If you fail to look ahead for a long time, the alarm will be level 2.
    this.fillObject(rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "703", "753", "activeSafetyDsm", false, true); //1
    //The system cannot work properly and alarm level 1
    this.fillObject(rootElement.lang.alarm_name_704 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "704", "754", "activeSafetyDsm", false, true); //1
    //The system cannot work properly and alarm level 2
    this.fillObject(rootElement.lang.alarm_name_704 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "705", "755", "activeSafetyDsm", false, true); //1
    //Level 1 alarm for driver not wearing a seat belt
    this.fillObject(rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "706", "756", "activeSafetyDsm", false, true); //1
    //Level 2 alarm for driver not wearing seat belt
    this.fillObject(rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "707", "757", "activeSafetyDsm", false, true); //1
    //Alarm level 1 when the driver is not in the driving seat
    this.fillObject(rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "708", "758", "activeSafetyDsm", false, true); //1
    //Level 2 alarm when the driver is not in the driving seat
    this.fillObject(rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "709", "759", "activeSafetyDsm", false, true); //1
    //Level 1 alarm occurs when the driver takes his hands off the steering wheel
    this.fillObject(rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "710", "760", "activeSafetyDsm", false, true); //1
    //Level 2 alarm occurs when the driver takes his hands off the steering wheel
    this.fillObject(rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "711", "761", "activeSafetyDsm", false, true); //1
    //
    this.fillObject(rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "717", "767", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "718", "768", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "734", "784", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "735", "785", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "736", "786", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "737", "787", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "738", "788", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "739", "789", "activeSafetyDsm", false, true); //1

    //tmps tire pressure
    //tire pressure alarm
    this.fillObject(rootElement.lang.alarm_name_632, rootElement.lang.tmps, "632", "682", "activeSafetyTmps", false, true); //1
    //BDS proximity alarm
    //Rear approach alarm
    this.fillObject(rootElement.lang.alarm_name_633, rootElement.lang.proximity, "633", "683", "activeSafetyProximity", false, true);   //1
    //Left rear proximity alarm
    this.fillObject(rootElement.lang.alarm_name_634, rootElement.lang.proximity, "634", "684", "activeSafetyProximity", false, true);   //1
    //Right rear proximity alarm
    this.fillObject(rootElement.lang.alarm_name_635, rootElement.lang.proximity, "635", "685", "activeSafetyProximity", false, true);   //1
    //Aggressive driving
    //Intense driving alarm (Sichuan standard)
    this.fillObject(rootElement.lang.alarm_name_720, rootElement.lang.fierce_driving_type, "720", "770", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_721, rootElement.lang.fierce_driving_type, "721", "771", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_722, rootElement.lang.fierce_driving_type, "722", "772", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_723, rootElement.lang.fierce_driving_type, "723", "773", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_724, rootElement.lang.fierce_driving_type, "724", "774", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_725, rootElement.lang.fierce_driving_type, "725", "775", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_726, rootElement.lang.fierce_driving_type, "726", "776", "activeSafetyFierce", false, true);    //1
    //Intelligent detection
    this.fillObject(rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_11111, rootElement.lang.znjc, "740", "790", "activeSafetyZnjc", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_22222, rootElement.lang.znjc, "741", "791", "activeSafetyZnjc", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_11111, rootElement.lang.znjc, "742", "792", "activeSafetyZnjc", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_22222, rootElement.lang.znjc, "743", "793", "activeSafetyZnjc", false, true);   //1
    //Satellite positioning alarm (Sichuan standard)
    this.fillObject(rootElement.lang.alarm_name_727, rootElement.lang.satellite_positioning_type, "727", "777", "activeSafetySatellite", false, true);  //1
    this.fillObject(rootElement.lang.alarm_name_744, rootElement.lang.satellite_positioning_type, "744", "794", "activeSafetySatellite", false, true);  //1
    //Supervision alarm
    if(rootElement.myUserRole && rootElement.myUserRole.isEnableNetworkControlAlarmReportBlackLabel()){
        this.fillObject(rootElement.lang.alarm_name_1326, rootElement.lang.supervisionAlarm, "1326", "1326", "supervisionAlarm", false, true);  //1
        this.fillObject(rootElement.lang.alarm_name_1327, rootElement.lang.supervisionAlarm, "1327", "1327", "supervisionAlarm", false, true);  //1
        this.fillObject(rootElement.lang.alarm_name_1328, rootElement.lang.supervisionAlarm, "1328", "1328", "supervisionAlarm", false, true);  //1
        this.fillObject(rootElement.lang.alarm_name_1329, rootElement.lang.supervisionAlarm, "1329", "1329", "supervisionAlarm", false, true);  //1
        this.fillObject(rootElement.lang.alarm_name_1330, rootElement.lang.supervisionAlarm, "1330", "1330", "supervisionAlarm", false, true);  //1
        this.fillObject(rootElement.lang.alarm_name_1331, rootElement.lang.supervisionAlarm, "1331", "1331", "supervisionAlarm", false, true);  //1
        this.fillObject(rootElement.lang.alarm_name_49, rootElement.lang.fatigueAlarm, "49", "49", "tiredAlarm", false, true);  //1
        this.fillObject(rootElement.lang.offline_move_black, rootElement.lang.offline_early_morning_alarm, "136", "136", "offlineEarlyMorningAlarm", false, true);  //1
        this.fillObject(rootElement.lang.no_traffic_night_black, rootElement.lang.offline_early_morning_alarm, "151", "151", "offlineEarlyMorningAlarm", false, true);  //1
    }

    this.fillObject(rootElement.lang.alarm_name_1600, rootElement.lang.Active_braking, "1600", null, "activeSafetyActiveBraking", false, true);
    this.fillObject(rootElement.lang.alarm_name_1601, rootElement.lang.Active_braking, "1601", null, "activeSafetyActiveBraking", false, true);
    this.fillObject(rootElement.lang.alarm_name_1602, rootElement.lang.Active_braking, "1602", null, "activeSafetyActiveBraking", false, true);
    this.fillObject(rootElement.lang.alarm_name_1605, rootElement.lang.Active_braking, "1605", null, "activeSafetyActiveBraking", false, true);
    this.fillObject(rootElement.lang.alarm_name_512, rootElement.lang.vehicle_operation_monitoring, "512", "562", "activeSafetyVehicleOperationMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_513, rootElement.lang.vehicle_operation_monitoring, "513", "563", "activeSafetyVehicleOperationMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_514, rootElement.lang.vehicle_operation_monitoring, "514", "564", "activeSafetyVehicleOperationMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_515, rootElement.lang.vehicle_operation_monitoring, "515", "565", "activeSafetyVehicleOperationMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_523, rootElement.lang.vehicle_operation_monitoring, "523", "573", "activeSafetyVehicleOperationMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_524, rootElement.lang.vehicle_operation_monitoring, "524", "574", "activeSafetyVehicleOperationMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_335, rootElement.lang.monitor_alarm_disk, "335", "385", "diskAlarm", false, true);	//1
    //Facial fatigue 249
    this.fillObject(rootElement.lang.alarm_name_249, rootElement.lang.monitor_alarm_adas, "249", "299", "adasAlarm", false, true);    //1
    //forward collision warning
    this.fillObject(rootElement.lang.alarm_name_430, rootElement.lang.monitor_alarm_adas, "430", "480", "adasAlarm", false, true);
    //Lane departure warning
    this.fillObject(rootElement.lang.alarm_name_431, rootElement.lang.monitor_alarm_adas, "431", "481", "adasAlarm", false, true);
    //Tire pressure warning
    this.fillObject(rootElement.lang.alarm_name_432, rootElement.lang.monitor_alarm_adas, "432", "482", "adasAlarm", false, true);
    //Rollover warning
    this.fillObject(rootElement.lang.alarm_name_433, rootElement.lang.monitor_alarm_adas, "433", "483", "adasAlarm", false, true);
    //Driving illegally
    this.fillObject(rootElement.lang.alarm_name_713, rootElement.lang.monitor_alarm_adas, "713", "763", "adasAlarm", false, true);
    //Right turn blind spot abnormality alarm
    this.fillObject(rootElement.lang.alarm_name_714, rootElement.lang.monitor_alarm_adas, "714", "764", "adasAlarm", false, true);
}

AlarmManager.prototype.addDailySummaryEx = function () {
    //Custom alarm 1
    this.fillObject(rootElement.lang.alarm_name_1, rootElement.lang.monitor_alarm_otherAlarm, "1", "", "otherAlarm", false, true);   //1
    //Emergency button alarm 2
    this.fillObject(rootElement.lang.alarm_name_2, rootElement.lang.monitor_alarm_operate, "2", "52", "operateAlarm", true, true);
    //Regional speed alarm 200
    this.fillObject(rootElement.lang.alarm_name_200, rootElement.lang.over_speed_alarm, "200", "250", "speendAlarm", false, true);  //1
    //Dangerous Driving Behavior Alert 201
    this.fillObject(rootElement.lang.alarm_name_201, rootElement.lang.monitor_alarm_otherAlarm, "201", "251", "otherAlarm", false, true);  //1
    //gnss module failure alarm      202
    this.fillObject(rootElement.lang.alarm_name_202, rootElement.lang.monitor_alarm_fault, "202", "252", "faultAlarm", false, true);  //1
    //GNSS antenna is not connected or cut off 203
    this.fillObject(rootElement.lang.alarm_name_203, rootElement.lang.monitor_alarm_fault, "203", "253", "faultAlarm", false, true); //1
    //GNSS antenna short circuit 204
    this.fillObject(rootElement.lang.alarm_name_204, rootElement.lang.monitor_alarm_fault, "204", "254", "faultAlarm", false, true);   //1
    //Power undervoltage 205
    this.fillObject(rootElement.lang.alarm_name_205, rootElement.lang.monitor_alarm_otherAlarm, "205", "255", "otherAlarm", false, true);    //1
    //Power failure 206
    this.fillObject(rootElement.lang.alarm_name_206, rootElement.lang.monitor_alarm_otherAlarm, "206", "256", "otherAlarm", false, true);  //1
    //Terminal LCD or display failure 207
    this.fillObject(rootElement.lang.alarm_name_207, rootElement.lang.monitor_alarm_fault, "207", "257", "faultAlarm", false, true);    //1
    //TTS module failure 208
    this.fillObject(rootElement.lang.alarm_name_208, rootElement.lang.monitor_alarm_fault, "208", "258", "faultAlarm", false, true);   //1
    //Camera failure 209
    this.fillObject(rootElement.lang.alarm_name_209, rootElement.lang.monitor_alarm_fault, "209", "259", "faultAlarm", false, true);  //1
    //Total driving time exceeded 210
    this.fillObject(rootElement.lang.alarm_name_210, rootElement.lang.monitor_alarm_otherAlarm, "210", "260", "otherAlarm", false, true);   //1
    //Alarm when parking too long 14
    this.fillObject(rootElement.lang.alarm_name_14, rootElement.lang.monitor_alarm_otherAlarm, "14", "64", "otherAlarm", false, true); //1
    //Entry and exit area 211
    this.fillObject(rootElement.lang.alarm_name_211, rootElement.lang.monitor_alarm_fence, "211", "261", "fenceAlarm", true, true);   //1
    //In and out route alarm 212
    this.fillObject(rootElement.lang.alarm_name_212, rootElement.lang.monitor_alarm_fence, "212", "262", "fenceAlarm", false, true);  //1
    //Road section travel time is too long/too short 213
    this.fillObject(rootElement.lang.alarm_name_213, rootElement.lang.monitor_alarm_fence, "213", "263", "fenceAlarm", false, true);  //1
    //Route Departure Alarm 214
    this.fillObject(rootElement.lang.alarm_name_214, rootElement.lang.monitor_alarm_fence, "214", "264", "fenceAlarm", false, true); //1
    //Vehicle VSS failure 215
    this.fillObject(rootElement.lang.alarm_name_215, rootElement.lang.monitor_alarm_fault, "215", "265", "faultAlarm", false, true); //1
    //Vehicle oil level abnormality alarm 216
    this.fillObject(rootElement.lang.alarm_name_216, rootElement.lang.monitor_alarm_fuel, "216", "266", "fuelAlarm", false, true); //1
    //Vehicle stolen alarm 217
    this.fillObject(rootElement.lang.alarm_name_217, rootElement.lang.monitor_alarm_otherAlarm, "217", "267", "otherAlarm", false, true);   //1
    //Vehicle illegal ignition alarm 8
    this.fillObject(rootElement.lang.alarm_name_8, rootElement.lang.monitor_alarm_otherAlarm, "8", "58", "otherAlarm", false, true);  //1
    //Illegal vehicle movement alarm 218
    this.fillObject(rootElement.lang.alarm_name_218, rootElement.lang.monitor_alarm_otherAlarm, "218", "268", "otherAlarm", false, true);   //1
    //Door sensor status alarm
    this.fillObject(rootElement.lang.alarm_name_1018, rootElement.lang.monitor_alarm_otherAlarm, "1018", "", "otherAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1249, rootElement.lang.monitor_alarm_otherAlarm, "1249", "", "otherAlarm", false, true);

    //Collision and rollover alarm 219
    this.fillObject(rootElement.lang.alarm_name_219, rootElement.lang.alarm_GSensor_type, "219", "269", "gSensor", false, true);   //1
    //Night driving alarm 151
    this.fillObject(rootElement.lang.alarm_name_151, rootElement.lang.offline_early_morning_alarm, "151", "152", "offlineEarlyMorningAlarm", false, true); //1
    //Speed ​​alarm 11
    this.fillObject(rootElement.lang.alarm_name_11, rootElement.lang.over_speed_alarm, "11", "61", "speendAlarm", false, true);    //1
    //Illegal door opening alarm 6
    this.fillObject(rootElement.lang.alarm_name_6, rootElement.lang.monitor_alarm_operate, "6", "56", "operateAlarm", false, true); //1
    //Regional speed alarm (generated by the platform) 300
    this.fillObject(rootElement.lang.alarm_name_300, rootElement.lang.over_speed_alarm, "300", "350", "speendAlarm", false, true);   //1
    //Regional low speed alarm (generated by the platform) 301
    this.fillObject(rootElement.lang.alarm_name_301, rootElement.lang.monitor_alarm_platform, "301", "351", "platformAlarm", false, true);    //1
    //Entering and exiting the area (generated by the platform) 302
    this.fillObject(rootElement.lang.alarm_name_302, rootElement.lang.monitor_alarm_platform, "302", "352", "platformAlarm", true, true);    //1
    //Line offset (generated by platform) 303
    this.fillObject(rootElement.lang.alarm_name_303, rootElement.lang.monitor_alarm_platform, "303", "353", "platformAlarm", false, true);   //1
    //Time period overspeed alarm (generated by the platform) 304
    this.fillObject(rootElement.lang.alarm_name_304, rootElement.lang.over_speed_alarm, "304", "354", "speendAlarm", false, true);   //1
    //Low speed alarm during time period (generated by platform) 305
    this.fillObject(rootElement.lang.alarm_name_305, rootElement.lang.monitor_alarm_platform, "305", "355", "platformAlarm", false, true);    //1
    //Drowsy driving (generated by the platform) 306
    this.fillObject(rootElement.lang.alarm_name_306_default, rootElement.lang.fatigueAlarm, "306", "356", "tiredAlarm", false, true);  //1
    //Timeout parking (generated by the platform) 307
    this.fillObject(rootElement.lang.alarm_name_307, rootElement.lang.monitor_alarm_platform, "307", "357", "platformAlarm", false, true); //1
    //Key point monitoring alarm (generated by the platform) 308
    this.fillObject(rootElement.lang.alarm_name_308, rootElement.lang.monitor_alarm_platform, "308", "358", "platformAlarm", false, true);   //1
    //Line speed alarm (generated by the platform) 309
    this.fillObject(rootElement.lang.alarm_name_309, rootElement.lang.over_speed_alarm, "309", "359", "speendAlarm", false, true);   //1
    //Line low speed alarm (generated by the platform) 310
    this.fillObject(rootElement.lang.alarm_name_310, rootElement.lang.monitor_alarm_platform, "310", "360", "platformAlarm", false, true);    //1
    //Road level speed alarm (generated by the platform) 311
    this.fillObject(rootElement.lang.alarm_name_311, rootElement.lang.over_speed_alarm, "311", "361", "speendAlarm", false, true);    //1
    //Drowsy driving 49
    this.fillObject(rootElement.lang.alarm_name_49, rootElement.lang.fatigueAlarm, "49", "99", "tiredAlarm", false, true);    //1
    //Speeding at night (generated by platform) 314
    this.fillObject(rootElement.lang.alarm_name_314, rootElement.lang.over_speed_alarm, "314", "364", "speendAlarm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_428, rootElement.lang.over_speed_alarm, "428", "478", "speendAlarm", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_712, rootElement.lang.monitor_alarm_fault, "712", "762", "faultAlarm", false, true);    //1
    //Fatigue driving warning
    this.fillObject(rootElement.lang.alarm_name_429, rootElement.lang.fatigueAlarm, "429", "479", "tiredAlarm", false, true);
    //ACC signal abnormal alarm (platform)
    this.fillObject(rootElement.lang.alarm_name_326, rootElement.lang.monitor_alarm_platform, "326", "376", "platformAlarm", false, true); //1
    //Location information abnormal alarm (platform)
    this.fillObject(rootElement.lang.alarm_name_327, rootElement.lang.monitor_alarm_platform, "327", "377", "platformAlarm", false, true); //1
    //Vehicle long-term abnormal offline reminder (platform)
    this.fillObject(rootElement.lang.alarm_name_328, rootElement.lang.monitor_alarm_platform, "328", "378", "platformAlarm", false, true);  //1
    //Offline displacement 136
    this.fillObject(rootElement.lang.alarm_name_136, rootElement.lang.offline_early_morning_alarm, "136", "", "offlineEarlyMorningAlarm", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_335, rootElement.lang.monitor_alarm_disk, "335", "385", "diskAlarm", false, true);	//1
    //Cumulative fatigue (platform)
    this.fillObject(rootElement.lang.alarm_name_1121, rootElement.lang.fatigueAlarm, "1121", null, "tiredAlarm", false, true);
    //Daytime Fatigue (Platform)
    this.fillObject(rootElement.lang.alarm_name_1126, rootElement.lang.fatigueAlarm, "1126", null, "tiredAlarm", false, true);
    //Nighttime Fatigue (Platform)
    this.fillObject(rootElement.lang.alarm_name_1127, rootElement.lang.fatigueAlarm, "1127", null, "tiredAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1031, rootElement.lang.fatigueAlarm, "1031", null, "tiredAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1032, rootElement.lang.fatigueAlarm, "1032", null, "tiredAlarm", false, true);
    //Passenger vehicles prohibited
    this.fillObject(rootElement.lang.alarm_name_220, rootElement.lang.monitor_alarm_platform, "220", null, "platformAlarm", false, true);
    //Prohibited on mountain roads
    this.fillObject(rootElement.lang.alarm_name_221, rootElement.lang.monitor_alarm_platform, "221", null, "platformAlarm", false, true);
    //Bus overcrowding alarm
    this.fillObject(rootElement.lang.alarm_name_231, rootElement.lang.monitor_alarm_platform, "231", null, "platformAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1333, rootElement.lang.over_speed_alarm, "1333", null, "speendAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1508, rootElement.lang.monitor_alarm_platform, "1508", null, "platformAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1514, rootElement.lang.monitor_alarm_platform, "1514", null, "platformAlarm", false, true);

    this.fillObject(rootElement.lang.alarm_name_1315, rootElement.lang.over_speed_alarm, "1315", "1365", "speendAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1316, rootElement.lang.over_speed_alarm, "1316", "1366", "speendAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1317, rootElement.lang.over_speed_alarm, "1317", "1367", "speendAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1318, rootElement.lang.over_speed_alarm, "1318", "1368", "speendAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1346, rootElement.lang.over_speed_alarm, "1346", "1396", "speendAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1319, rootElement.lang.fatigueAlarm, "1319", "1369", "tiredAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1320, rootElement.lang.fatigueAlarm, "1320", "1370", "tiredAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1321, rootElement.lang.fatigueAlarm, "1321", "1371", "tiredAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1322, rootElement.lang.fatigueAlarm, "1322", "1372", "tiredAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1323, rootElement.lang.fatigueAlarm, "1323", "1373", "tiredAlarm", false, true);
    this.fillObject(rootElement.lang.alarm_name_1502 + rootElement.lang.alarm_name_11111, rootElement.lang.monitor_alarm_platform, "1502", "1552", "platformAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1502 + rootElement.lang.alarm_name_22222, rootElement.lang.monitor_alarm_platform, "1503", "1553", "platformAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1502 + rootElement.lang.alarm_name_33333, rootElement.lang.monitor_alarm_platform, "1504", "1554", "platformAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1502 + rootElement.lang.alarm_name_44444, rootElement.lang.monitor_alarm_platform, "1505", "1555", "platformAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1502 + rootElement.lang.alarm_name_55555, rootElement.lang.monitor_alarm_platform, "1506", "1556", "platformAlarm", false, true);	//1


    //ADAS class
    //Forward collision warning level 1
    this.fillObject(rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "600", "650", "activeSafetyAdas", false, true); //1
    //Forward collision warning level 2
    this.fillObject(rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "601", "651", "activeSafetyAdas", false, true); //1
    //Lane departure warning level 1
    this.fillObject(rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "602", "652", "activeSafetyAdas", false, true); //1
    //Lane departure warning level 2
    this.fillObject(rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "603", "653", "activeSafetyAdas", false, true); //1
    //Alarm for vehicles too close to each other Level 1
    this.fillObject(rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "604", "654", "activeSafetyAdas", false, true); //1
    //Alarm for vehicles too close to each other Level 2
    this.fillObject(rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "605", "655", "activeSafetyAdas", false, true); //1
    //Pedestrian Collision Alarm Level 1
    this.fillObject(rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "606", "656", "activeSafetyAdas", false, true); //1
    //Pedestrian Collision Alarm Level 2
    this.fillObject(rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "607", "657", "activeSafetyAdas", false, true); //1
    //Frequent lane changes Level 1
    this.fillObject(rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "608", "658", "activeSafetyAdas", false, true); //1
    //Frequent lane changes Level 2
    this.fillObject(rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "609", "659", "activeSafetyAdas", false, true); //1
    //Road sign over-limit alarm level 1
    this.fillObject(rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "610", "660", "activeSafetyAdas", false, true); //1
    //Road sign over-limit alarm level 2
    this.fillObject(rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "611", "661", "activeSafetyAdas", false, true); //1
    //Obstacle alarm level 1
    this.fillObject(rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "612", "662", "activeSafetyAdas", false, true); //1
    //Obstacle alarm level 2
    this.fillObject(rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "613", "663", "activeSafetyAdas", false, true); //1
    //Curved speed warning level 1
    this.fillObject(rootElement.lang.alarm_name_700 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "700", "750", "activeSafetyAdas", false, true); //1
    //Curved speed warning level 2
    this.fillObject(rootElement.lang.alarm_name_700 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "701", "751", "activeSafetyAdas", false, true); //1
    //715
    this.fillObject(rootElement.lang.alarm_name_715 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "715", "765", "activeSafetyAdas", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_715 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "716", "766", "activeSafetyAdas", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_728 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "728", "778", "activeSafetyAdas", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_728 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "729", "779", "activeSafetyAdas", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_730 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "730", "780", "activeSafetyAdas", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_730 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "731", "781", "activeSafetyAdas", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_732 + rootElement.lang.alarm_name_11111, rootElement.lang.safetyAdas, "732", "782", "activeSafetyAdas", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_732 + rootElement.lang.alarm_name_22222, rootElement.lang.safetyAdas, "733", "783", "activeSafetyAdas", false, true); //1
    //Fatigue driving alarm level 1
    this.fillObject(rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "618", "668", "activeSafetyDsm", false, true);
    //Fatigue driving alarm level 2
    this.fillObject(rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "619", "669", "activeSafetyDsm", false, true);
    //Call the police Level 1
    this.fillObject(rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "620", "670", "activeSafetyDsm", false, true); //1
    //Call the police Level 2
    this.fillObject(rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "621", "671", "activeSafetyDsm", false, true); //1
    //Smoking alarm level 1
    this.fillObject(rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "622", "672", "activeSafetyDsm", false, true); //1
    //Smoking alarm level 2
    this.fillObject(rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "623", "673", "activeSafetyDsm", false, true); //1
    //Distracted driving alarm level 1
    this.fillObject(rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "624", "674", "activeSafetyDsm", false, true); //1
    //Distracted driving alarm level 2
    this.fillObject(rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "625", "675", "activeSafetyDsm", false, true); //1
    //Driver abnormality alarm level 1
    this.fillObject(rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "626", "676", "activeSafetyDsm", false, true); //1
    //Driver abnormality alarm level 2
    this.fillObject(rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "627", "677", "activeSafetyDsm", false, true); //1
    //Level 1 alarm for sunglasses failure
    this.fillObject(rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "639", "689", "activeSafetyDsm", false, true); //1
    //Sunglasses failure level 2 alarm
    this.fillObject(rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "640", "690", "activeSafetyDsm", false, true); //1
    //Driver IC card abnormal alarm level 1
    this.fillObject(rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "641", "691", "activeSafetyDsm", false, true); //1
    //Driver IC card abnormal alarm level 2
    this.fillObject(rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "642", "692", "activeSafetyDsm", false, true); //1
    //
    this.fillObject(rootElement.lang.alarm_name_644 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "644", "694", "activeSafetyDsm", false, true); //1
    //
    this.fillObject(rootElement.lang.alarm_name_644 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "645", "695", "activeSafetyDsm", false, true); //1
    //Take one hand off the steering wheel
    this.fillObject(rootElement.lang.alarm_name_745 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "745", "795", "activeSafetyDsm", false, true);
    this.fillObject(rootElement.lang.alarm_name_745 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "746", "796", "activeSafetyDsm", false, true);
    //If you fail to look ahead for a long time, the alarm will be level 1.
    this.fillObject(rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "702", "752", "activeSafetyDsm", false, true); //1
    //If you fail to look ahead for a long time, the alarm will be level 2.
    this.fillObject(rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "703", "753", "activeSafetyDsm", false, true); //1
    //The system cannot work properly and alarm level 1
    this.fillObject(rootElement.lang.alarm_name_704 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "704", "754", "activeSafetyDsm", false, true); //1
    //The system cannot work properly and alarm level 2
    this.fillObject(rootElement.lang.alarm_name_704 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "705", "755", "activeSafetyDsm", false, true); //1
    //Level 1 alarm for driver not wearing a seat belt
    this.fillObject(rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "706", "756", "activeSafetyDsm", false, true); //1
    //Level 2 alarm for driver not wearing seat belt
    this.fillObject(rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "707", "757", "activeSafetyDsm", false, true); //1
    //Alarm level 1 when the driver is not in the driving seat
    this.fillObject(rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "708", "758", "activeSafetyDsm", false, true); //1
    //Level 2 alarm when the driver is not in the driving seat
    this.fillObject(rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "709", "759", "activeSafetyDsm", false, true); //1
    //Level 1 alarm occurs when the driver takes his hands off the steering wheel
    this.fillObject(rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "710", "760", "activeSafetyDsm", false, true); //1
    //Level 2 alarm occurs when the driver takes his hands off the steering wheel
    this.fillObject(rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "711", "761", "activeSafetyDsm", false, true); //1
    //
    this.fillObject(rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "717", "767", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "718", "768", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "734", "784", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "735", "785", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "736", "786", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "737", "787", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_11111, rootElement.lang.abnormality, "738", "788", "activeSafetyDsm", false, true); //1
    this.fillObject(rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_22222, rootElement.lang.abnormality, "739", "789", "activeSafetyDsm", false, true); //1

    //tmps tire pressure
    //tire pressure alarm
    this.fillObject(rootElement.lang.alarm_name_632, rootElement.lang.tmps, "632", "682", "activeSafetyTmps", false, true); //1
    //BDS proximity alarm
    //Rear approach alarm
    this.fillObject(rootElement.lang.alarm_name_633, rootElement.lang.proximity, "633", "683", "activeSafetyProximity", false, true);   //1
    //Left rear proximity alarm
    this.fillObject(rootElement.lang.alarm_name_634, rootElement.lang.proximity, "634", "684", "activeSafetyProximity", false, true);   //1
    //Right rear proximity alarm
    this.fillObject(rootElement.lang.alarm_name_635, rootElement.lang.proximity, "635", "685", "activeSafetyProximity", false, true);   //1
    //Aggressive driving
    //Intense driving alarm (Sichuan standard)
    this.fillObject(rootElement.lang.alarm_name_720, rootElement.lang.fierce_driving_type, "720", "770", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_721, rootElement.lang.fierce_driving_type, "721", "771", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_722, rootElement.lang.fierce_driving_type, "722", "772", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_723, rootElement.lang.fierce_driving_type, "723", "773", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_724, rootElement.lang.fierce_driving_type, "724", "774", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_725, rootElement.lang.fierce_driving_type, "725", "775", "activeSafetyFierce", false, true);    //1
    this.fillObject(rootElement.lang.alarm_name_726, rootElement.lang.fierce_driving_type, "726", "776", "activeSafetyFierce", false, true);    //1
    //Intelligent detection
    this.fillObject(rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_11111, rootElement.lang.znjc, "740", "790", "activeSafetyZnjc", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_22222, rootElement.lang.znjc, "741", "791", "activeSafetyZnjc", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_11111, rootElement.lang.znjc, "742", "792", "activeSafetyZnjc", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_22222, rootElement.lang.znjc, "743", "793", "activeSafetyZnjc", false, true);   //1
    //Satellite positioning alarm (Sichuan standard)
    this.fillObject(rootElement.lang.alarm_name_727, rootElement.lang.satellite_positioning_type, "727", "777", "activeSafetySatellite", false, true);  //1
    this.fillObject(rootElement.lang.alarm_name_744, rootElement.lang.satellite_positioning_type, "744", "794", "activeSafetySatellite", false, true);  //1
    this.fillObject(rootElement.lang.alarm_name_512, rootElement.lang.vehicle_operation_monitoring, "512", "562", "activeSafetyVehicleOperationMonitoring", false, true);   //1
    this.fillObject(rootElement.lang.alarm_name_545, rootElement.lang.znjc, "545", "595", "activeSafetyZnjc", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_549, rootElement.lang.znjc, "549", "599", "activeSafetyZnjc", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1237, rootElement.lang.znjc, "1237", "1287", "activeSafetyZnjc", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1326, rootElement.lang.supervisionAlarm, "1326", "1326", "supervisionAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1327, rootElement.lang.supervisionAlarm, "1327", "1327", "supervisionAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1328, rootElement.lang.supervisionAlarm, "1328", "1328", "supervisionAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1329, rootElement.lang.supervisionAlarm, "1329", "1329", "supervisionAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1330, rootElement.lang.supervisionAlarm, "1330", "1330", "supervisionAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1331, rootElement.lang.supervisionAlarm, "1331", "1331", "supervisionAlarm", false, true);	//1

    this.fillObject(rootElement.lang.alarm_name_1334 + rootElement.lang.alarm_name_11111, rootElement.lang.offline_early_morning_alarm,  "1334","1384", "offlineEarlyMorningAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1334 + rootElement.lang.alarm_name_22222, rootElement.lang.offline_early_morning_alarm,  "1335","1385", "offlineEarlyMorningAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1334 + rootElement.lang.alarm_name_33333, rootElement.lang.offline_early_morning_alarm,  "1336","1386", "offlineEarlyMorningAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1334 + rootElement.lang.alarm_name_44444, rootElement.lang.offline_early_morning_alarm,  "1500","1550", "offlineEarlyMorningAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_1334 + rootElement.lang.alarm_name_55555, rootElement.lang.offline_early_morning_alarm,  "1501","1551", "offlineEarlyMorningAlarm", false, true);	//1


    this.fillObject(rootElement.lang.alarm_name_1314, rootElement.lang.monitor_alarm_platform, "1314", null, "platformAlarm", false, true);  //1

    this.fillObject(rootElement.lang.alarm_name_1518, rootElement.lang.monitor_alarm_platform, "1518", "1568", "platformAlarm", false, true);	//1

    this.fillObject(rootElement.lang.alarm_name_1600, rootElement.lang.Active_braking, "1600", null, "activeSafetyActiveBraking", false, true);
    this.fillObject(rootElement.lang.alarm_name_1601, rootElement.lang.Active_braking, "1601", null, "activeSafetyActiveBraking", false, true);
    this.fillObject(rootElement.lang.alarm_name_1602, rootElement.lang.Active_braking, "1602", null, "activeSafetyActiveBraking", false, true);
    this.fillObject(rootElement.lang.alarm_name_1605, rootElement.lang.Active_braking, "1605", null, "activeSafetyActiveBraking", false, true);

    //Facial fatigue 249
    this.fillObject(rootElement.lang.alarm_name_249, rootElement.lang.monitor_alarm_adas, "249", "299", "adasAlarm", false, true);    //1
    //forward collision warning
    this.fillObject(rootElement.lang.alarm_name_430, rootElement.lang.monitor_alarm_adas, "430", "480", "adasAlarm", false, true);
    //Lane departure warning
    this.fillObject(rootElement.lang.alarm_name_431, rootElement.lang.monitor_alarm_adas, "431", "481", "adasAlarm", false, true);
    //Tire pressure warning
    this.fillObject(rootElement.lang.alarm_name_432, rootElement.lang.monitor_alarm_adas, "432", "482", "adasAlarm", false, true);
    //Rollover warning
    this.fillObject(rootElement.lang.alarm_name_433, rootElement.lang.monitor_alarm_adas, "433", "483", "adasAlarm", false, true);
    //Driving illegally
    this.fillObject(rootElement.lang.alarm_name_713, rootElement.lang.monitor_alarm_adas, "713", "763", "adasAlarm", false, true);
    //Right turn blind spot abnormality alarm
    this.fillObject(rootElement.lang.alarm_name_714, rootElement.lang.monitor_alarm_adas, "714", "764", "adasAlarm", false, true);
}

/**
 * Initialize 809 alarm
 */
AlarmManager.prototype.init809Object = function () {
    //Alarm classification
    this.fill809Object("0", "alarmClassify", rootElement.lang.alarm_classify);
    /*****tired Alarm*****/
    this.fill809Object("alarmClassify", "tiredAlarm", rootElement.lang.fatigueAlarm);
    this.fill809Object("tiredAlarm", "49", rootElement.lang.alarm_name_49);
    //Drowsy driving (generated by the platform) 306
    this.fill809Object("tiredAlarm", "306", rootElement.lang.alarm_name_306_default);


    /*****Operation Alarm*****/
    this.fill809Object("alarmClassify", "operateAlarm", rootElement.lang.monitor_alarm_operate);
    //Emergency button alarm 2
    this.fill809Object("operateAlarm", "2", rootElement.lang.alarm_name_2);

    /*****error alarm*****/
    this.fill809Object("alarmClassify", "monitorAlarmFault", rootElement.lang.monitor_alarm_fault);
    //gnss module failure alarm      202
    this.fill809Object("monitorAlarmFault", "202", rootElement.lang.alarm_name_202);
    //GNSS antenna short circuit 204
    this.fill809Object("monitorAlarmFault", "204", rootElement.lang.alarm_name_204);
    //GNSS antenna is not connected or cut off 203
    this.fill809Object("monitorAlarmFault", "203", rootElement.lang.alarm_name_203);
    //TTS module failure 208
    this.fill809Object("monitorAlarmFault", "208", rootElement.lang.alarm_name_208);
    //Vehicle VSS failure 215
    this.fill809Object("monitorAlarmFault", "215", rootElement.lang.alarm_name_215);
    //Camera failure 209
    this.fill809Object("monitorAlarmFault", "209", rootElement.lang.alarm_name_209);
    //Terminal LCD or display failure 207
    this.fill809Object("monitorAlarmFault", "207", rootElement.lang.alarm_name_207);

    /****Platform Alarm*****/
    this.fill809Object("alarmClassify", "offlineEarlyMorningAlarm", rootElement.lang.offline_early_morning_alarm);
    //Night driving alarm 151
    this.fill809Object("offlineEarlyMorningAlarm", "151", rootElement.lang.alarm_name_151);


    /*****Video Alarm*****/
    this.fill809Object("alarmClassify", "monitorAlarmVideo", rootElement.lang.monitor_alarm_video);
    //Video signal loss alarm
    this.fill809Object("monitorAlarmVideo", "4", rootElement.lang.alarm_name_4);
    //Video signal blocking alarm
    this.fill809Object("monitorAlarmVideo", "5", rootElement.lang.alarm_name_5);

    /****Speed ​​Alarm*****/
    this.fill809Object("alarmClassify", "speendAlarm", rootElement.lang.over_speed_alarm);
    //Speed ​​alarm 11
    this.fill809Object("speendAlarm", "11", rootElement.lang.alarm_name_11);
    //Regional speed alarm 200
    this.fill809Object("speendAlarm", "200", rootElement.lang.alarm_name_200);

    /****Fence Alarm*****/
    this.fill809Object("alarmClassify", "monitorAlarmFence", rootElement.lang.monitor_alarm_fence);
    //In and out route alarm 212
    this.fill809Object("monitorAlarmFence", "212", rootElement.lang.alarm_name_212);
    //Entry and exit area 211
    this.fill809Object("monitorAlarmFence", "211", rootElement.lang.alarm_name_211);
    //Route Departure Alarm 214
    this.fill809Object("monitorAlarmFence", "214", rootElement.lang.alarm_name_214);

    /****Abnormal alarm*****/
    this.fill809Object("alarmClassify", "monitorAlarmAbnormal", rootElement.lang.monitor_alarm_abnormal);
    //Vehicle stolen alarm 217
    this.fill809Object("monitorAlarmAbnormal", "217", rootElement.lang.alarm_name_217);
    //Illegal vehicle movement alarm 218
    this.fill809Object("monitorAlarmAbnormal", "218", rootElement.lang.alarm_name_218);
    //Bus overcrowding alarm
    this.fill809Object("monitorAlarmAbnormal", "231", rootElement.lang.alarm_name_231);
    //Collision and rollover alarm 219
    this.fill809Object("monitorAlarmAbnormal", "219", rootElement.lang.alarm_name_219);
    //Other video equipment failure alarm 244 countStr44
    this.fill809Object("monitorAlarmAbnormal", "244", rootElement.lang.alarm_name_244);
    //Abnormal driving 248 countStr47
    this.fill809Object("monitorAlarmAbnormal", "248", rootElement.lang.abnormal_drive);
    //Right turn blind spot abnormality alarm
    this.fill809Object("monitorAlarmAbnormal", "714", rootElement.lang.alarm_name_714);
    //Power failure 206
    this.fill809Object("monitorAlarmAbnormal", "206", rootElement.lang.alarm_name_206);
    //Power undervoltage 205
    this.fill809Object("monitorAlarmAbnormal", "205", rootElement.lang.alarm_name_205);

    /*****Hard disk alarm*****/
    this.fill809Object("alarmClassify", "monitorAlarmDisk", rootElement.lang.monitor_alarm_disk);
    //Hard disk error alarm
    this.fill809Object("monitorAlarmDisk", "10", rootElement.lang.alarm_name_10);

    /*****Oil level alarm*****/
    this.fill809Object("alarmClassify", "monitorAlarmFuel", rootElement.lang.monitor_alarm_fuel);
    //Vehicle oil level abnormality alarm 216
    this.fill809Object("monitorAlarmFuel", "216", rootElement.lang.alarm_name_216);

    /*****Active security alarm*****/
    this.fill809Object("alarmClassify", "monitorAlarmSafety", rootElement.lang.safeAlarmLabel);
    //1. Advanced driver assistance system (ADAS)
    this.fill809Object("monitorAlarmSafety", "subiaoAdas", rootElement.lang.adas);
    //Lane departure warning level 1
    this.fill809Object("subiaoAdas", "602", rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_11111);
    //Lane departure warning level 2
    this.fill809Object("subiaoAdas", "603", rootElement.lang.alarm_name_602 + rootElement.lang.alarm_name_22222);
    //Forward collision warning level 1
    this.fill809Object("subiaoAdas", "600", rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_11111);
    //Forward collision warning level 2
    this.fill809Object("subiaoAdas", "601", rootElement.lang.alarm_name_600 + rootElement.lang.alarm_name_22222);
    //Road sign over-limit alarm level 2
    this.fill809Object("subiaoAdas", "610", rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_11111);
    //Road sign over-limit alarm level 1
    this.fill809Object("subiaoAdas", "611", rootElement.lang.alarm_name_610 + rootElement.lang.alarm_name_22222);
    //Frequent lane changes Level 2
    this.fill809Object("subiaoAdas", "608", rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_11111);
    //Frequent lane changes Level 1
    this.fill809Object("subiaoAdas", "609", rootElement.lang.alarm_name_608 + rootElement.lang.alarm_name_22222);
    //Pedestrian Collision Alarm Level 2
    this.fill809Object("subiaoAdas", "606", rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_11111);
    //Pedestrian Collision Alarm Level 1
    this.fill809Object("subiaoAdas", "607", rootElement.lang.alarm_name_606 + rootElement.lang.alarm_name_22222);
    //Alarm for vehicles too close to each other Level 2
    this.fill809Object("subiaoAdas", "604", rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_11111);
    //Alarm for vehicles too close to each other Level 1
    this.fill809Object("subiaoAdas", "605", rootElement.lang.alarm_name_604 + rootElement.lang.alarm_name_22222);
    //Obstacle alarm level 2
    this.fill809Object("subiaoAdas", "612", rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_11111);
    //Obstacle alarm level 1
    this.fill809Object("subiaoAdas", "613", rootElement.lang.alarm_name_612 + rootElement.lang.alarm_name_22222);
    //715
    this.fill809Object("subiaoAdas", "715", rootElement.lang.alarm_name_715 + rootElement.lang.alarm_name_11111);
    //Driving assistance function failure alarm level 2
    this.fill809Object("subiaoAdas", "716", rootElement.lang.alarm_name_715 + rootElement.lang.alarm_name_22222);
    //1. Intense driving alarm
    this.fill809Object("monitorAlarmSafety", "monitorAlarmIntenseDrive", rootElement.lang.monitor_alarm_intense_drive);
    this.fill809Object("monitorAlarmIntenseDrive", "720", rootElement.lang.alarm_name_720);
    this.fill809Object("monitorAlarmIntenseDrive", "721", rootElement.lang.alarm_name_721);
    this.fill809Object("monitorAlarmIntenseDrive", "722", rootElement.lang.alarm_name_722);
    this.fill809Object("monitorAlarmIntenseDrive", "723", rootElement.lang.alarm_name_723);
    this.fill809Object("monitorAlarmIntenseDrive", "724", rootElement.lang.alarm_name_724);
    this.fill809Object("monitorAlarmIntenseDrive", "725", rootElement.lang.alarm_name_725);
    this.fill809Object("monitorAlarmIntenseDrive", "726", rootElement.lang.alarm_name_726);
    //1. Driver Status Monitoring System (DSM)
    this.fill809Object("monitorAlarmSafety", "subiaoDsm", rootElement.lang.subiao_dsm);
    //Fatigue driving alarm level 1
    this.fill809Object("subiaoDsm", "618", rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_11111);
    //Fatigue driving alarm level 2
    this.fill809Object("subiaoDsm", "619", rootElement.lang.alarm_name_618 + rootElement.lang.alarm_name_22222);
    //Call the police Level 1
    this.fill809Object("subiaoDsm", "620", rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_11111);
    //Call the police Level 2
    this.fill809Object("subiaoDsm", "621", rootElement.lang.alarm_name_620 + rootElement.lang.alarm_name_22222);
    //Smoking alarm level 1
    this.fill809Object("subiaoDsm", "622", rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_11111);
    //Smoking alarm level 2
    this.fill809Object("subiaoDsm", "623", rootElement.lang.alarm_name_622 + rootElement.lang.alarm_name_22222);
    //Distracted driving alarm level 1
    this.fill809Object("subiaoDsm", "624", rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_11111);
    //Distracted driving alarm level 2
    this.fill809Object("subiaoDsm", "625", rootElement.lang.alarm_name_624 + rootElement.lang.alarm_name_22222);
    //Driver abnormality alarm level 1
    this.fill809Object("subiaoDsm", "626", rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_11111);
    //Driver abnormality alarm level 2
    this.fill809Object("subiaoDsm", "627", rootElement.lang.alarm_name_626 + rootElement.lang.alarm_name_22222);
    //Level 1 alarm for sunglasses failure
    this.fill809Object("subiaoDsm", "639", rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_11111);
    //Sunglasses failure level 2 alarm
    this.fill809Object("subiaoDsm", "640", rootElement.lang.alarm_name_639 + rootElement.lang.alarm_name_22222);
    //Driver IC card abnormal alarm level 1
    this.fill809Object("subiaoDsm", "641", rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_11111);
    //Driver IC card abnormal alarm level 2
    this.fill809Object("subiaoDsm", "642", rootElement.lang.alarm_name_641 + rootElement.lang.alarm_name_22222);
    //If you fail to look ahead for a long time, the alarm will be level 1.
    this.fill809Object("subiaoDsm", "702", rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_11111);
    //If you fail to look ahead for a long time, the alarm will be level 2.
    this.fill809Object("subiaoDsm", "703", rootElement.lang.alarm_name_702 + rootElement.lang.alarm_name_22222);
    this.fill809Object("subiaoDsm", "738", rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_11111);
    this.fill809Object("subiaoDsm", "739", rootElement.lang.alarm_name_738 + rootElement.lang.alarm_name_22222);
    this.fill809Object("subiaoDsm", "736", rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_11111);
    this.fill809Object("subiaoDsm", "737", rootElement.lang.alarm_name_736 + rootElement.lang.alarm_name_22222);
    this.fill809Object("subiaoDsm", "719", rootElement.lang.alarm_name_719);
    //
    this.fill809Object("subiaoDsm", "717", rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_11111);
    this.fill809Object("subiaoDsm", "718", rootElement.lang.alarm_name_717 + rootElement.lang.alarm_name_22222);
    //Level 1 alarm for driver not wearing a seat belt
    this.fill809Object("subiaoDsm", "706", rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_11111);
    //Level 2 alarm for driver not wearing seat belt
    this.fill809Object("subiaoDsm", "707", rootElement.lang.alarm_name_706 + rootElement.lang.alarm_name_22222);
    //Alarm level 1 when the driver is not in the driving seat
    this.fill809Object("subiaoDsm", "708", rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_11111);
    //Level 2 alarm when the driver is not in the driving seat
    this.fill809Object("subiaoDsm", "709", rootElement.lang.alarm_name_708 + rootElement.lang.alarm_name_22222);
    //Level 1 alarm occurs when the driver takes his hands off the steering wheel
    this.fill809Object("subiaoDsm", "710", rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_11111);
    //Level 2 alarm occurs when the driver takes his hands off the steering wheel
    this.fill809Object("subiaoDsm", "711", rootElement.lang.alarm_name_710 + rootElement.lang.alarm_name_22222);
    this.fill809Object("subiaoDsm", "734", rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_11111);
    this.fill809Object("subiaoDsm", "735", rootElement.lang.alarm_name_734 + rootElement.lang.alarm_name_22222);
    //1. Tire pressure monitoring system (TPMS)
    this.fill809Object("monitorAlarmSafety", "tirePressureMonitoringSystem", rootElement.lang.tire_pressure_monitoring_system);
    //tire pressure alarm
    this.fill809Object("tirePressureMonitoringSystem", "632", rootElement.lang.alarm_name_632);
    //1. Blind Spot Monitoring System (BSD)
    this.fill809Object("monitorAlarmSafety", "blindSpotMonitoringSystem", rootElement.lang.blind_spot_monitoring_system);
    //Rear approach alarm
    this.fill809Object("blindSpotMonitoringSystem", "633", rootElement.lang.alarm_name_633);
    //Left rear proximity alarm
    this.fill809Object("blindSpotMonitoringSystem", "634", rootElement.lang.alarm_name_634);
    //Right rear proximity alarm
    this.fill809Object("blindSpotMonitoringSystem", "635", rootElement.lang.alarm_name_635);
    //1. Intelligent detection and alarm
    this.fill809Object("monitorAlarmSafety", "intelligentDetectionAndAlarm", rootElement.lang.intelligent_detection_and_alarm);
    this.fill809Object("intelligentDetectionAndAlarm", "740", rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_11111);
    this.fill809Object("intelligentDetectionAndAlarm", "741", rootElement.lang.alarm_name_740 + rootElement.lang.alarm_name_22222);
    this.fill809Object("intelligentDetectionAndAlarm", "742", rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_11111);
    this.fill809Object("intelligentDetectionAndAlarm", "743", rootElement.lang.alarm_name_742 + rootElement.lang.alarm_name_22222);

    /*****Safety Assisted Driving Alarm*****/
    this.fill809Object("alarmClassify", "monitorAlarmAdas", rootElement.lang.monitor_alarm_adas);
    //Rollover warning
    this.fill809Object("monitorAlarmAdas", "433", rootElement.lang.alarm_name_433);
    //Smoking warning
    this.fill809Object("monitorAlarmAdas", "176", rootElement.lang.alarm_name_176);
    //Total driving time exceeded 210
    this.fill809Object("monitorAlarmAdas", "210", rootElement.lang.alarm_name_210);
    //brake suddenly
    this.fill809Object("monitorAlarmAdas", "407", rootElement.lang.alarm_name_407);
    //Mobile phone alert
    this.fill809Object("monitorAlarmAdas", "174", rootElement.lang.alarm_name_174);
    //Tire pressure alarm (ADAS)
    this.fill809Object("monitorAlarmAdas", "168", rootElement.lang.alarm_name_168);

}


AlarmManager.prototype.addAlarmTypeBy2 = function () {
    //Speed ​​alarm 11
    this.fillObject(rootElement.lang.alarm_name_11, rootElement.lang.over_speed_alarm, "11", "61", "speendAlarm", false, true);    //1
    //Custom alarm 1
    this.fillObject(rootElement.lang.alarm_name_1, rootElement.lang.monitor_alarm_otherAlarm, "1", "", "otherAlarm", false, true);	//1
    //Emergency button alarm 2
    this.fillObject(rootElement.lang.alarm_name_2, rootElement.lang.monitor_alarm_operate, "2", "52", "operateAlarm", true, true);
    //Regional speed alarm 200
    this.fillObject(rootElement.lang.alarm_name_200, rootElement.lang.over_speed_alarm, "200", "250", "speendAlarm", false, true);	//1
    //Dangerous Driving Behavior Alert 201
    this.fillObject(rootElement.lang.alarm_name_201, rootElement.lang.monitor_alarm_otherAlarm, "201", "251", "otherAlarm", false, true);	//1
    //gnss module failure alarm		202
    this.fillObject(rootElement.lang.alarm_name_202, rootElement.lang.monitor_alarm_fault, "202", "252", "faultAlarm", false, true);	//1
    //GNSS antenna is not connected or cut off 203
    this.fillObject(rootElement.lang.alarm_name_203, rootElement.lang.monitor_alarm_fault, "203", "253", "faultAlarm", false, true);	//1
    //GNSS antenna short circuit 204
    this.fillObject(rootElement.lang.alarm_name_204, rootElement.lang.monitor_alarm_fault, "204", "254", "faultAlarm", false, true);	//1
    //Power undervoltage 205
    this.fillObject(rootElement.lang.alarm_name_205, rootElement.lang.monitor_alarm_otherAlarm, "205", "255", "otherAlarm", false, true);	//1
    //Power failure 206
    this.fillObject(rootElement.lang.alarm_name_206, rootElement.lang.monitor_alarm_otherAlarm, "206", "256", "otherAlarm", false, true);	//1
    //Terminal LCD or display failure 207
    if (rootElement.myUserRole && !rootElement.myUserRole.isShieldReport()) {
        this.fillObject(rootElement.lang.alarm_name_207, rootElement.lang.monitor_alarm_fault, "207", "257", "faultAlarm", false, true);	//1
    }
    //TTS module failure 208
    this.fillObject(rootElement.lang.alarm_name_208, rootElement.lang.monitor_alarm_fault, "208", "258", "faultAlarm", false, true);	//1
    //Camera failure 209
    this.fillObject(rootElement.lang.alarm_name_209, rootElement.lang.monitor_alarm_fault, "209", "259", "faultAlarm", false, true);	//1
    //Total driving time exceeded 210
    this.fillObject(rootElement.lang.alarm_name_210, rootElement.lang.monitor_alarm_otherAlarm, "210", "260", "otherAlarm", false, true);	//1
    //Alarm when parking too long 14
    this.fillObject(rootElement.lang.alarm_name_14, rootElement.lang.monitor_alarm_otherAlarm, "14", "64", "otherAlarm", false, true);	//1
    //Entry and exit area 211
    this.fillObject(rootElement.lang.alarm_name_211, rootElement.lang.monitor_alarm_fence, "211", "261", "fenceAlarm", true, true);	//1
    //In and out route alarm 212
    this.fillObject(rootElement.lang.alarm_name_212, rootElement.lang.monitor_alarm_fence, "212", "262", "fenceAlarm", false, true);	//1
    //Road section travel time is too long/too short 213
    this.fillObject(rootElement.lang.alarm_name_213, rootElement.lang.monitor_alarm_fence, "213", "263", "fenceAlarm", false, true);	//1
    //Route Departure Alarm 214
    this.fillObject(rootElement.lang.alarm_name_214, rootElement.lang.monitor_alarm_fence, "214", "264", "fenceAlarm", false, true);	//1
    //Vehicle VSS failure 215
    this.fillObject(rootElement.lang.alarm_name_215, rootElement.lang.monitor_alarm_fault, "215", "265", "faultAlarm", false, true);	//1
    //Vehicle oil level abnormality alarm 216
    this.fillObject(rootElement.lang.alarm_name_216, rootElement.lang.monitor_alarm_fuel, "216", "266", "fuelAlarm", false, true);	//1
    if (rootElement.myUserRole && !rootElement.myUserRole.isShieldReport()) {
        //Vehicle stolen alarm 217
        this.fillObject(rootElement.lang.alarm_name_217, rootElement.lang.monitor_alarm_otherAlarm, "217", "267", "otherAlarm", false, true);	//1
        //Vehicle illegal ignition alarm 8
        this.fillObject(rootElement.lang.alarm_name_8, rootElement.lang.monitor_alarm_otherAlarm, "8", "58", "otherAlarm", false, true);	//1
        //Illegal vehicle movement alarm 218
        this.fillObject(rootElement.lang.alarm_name_218, rootElement.lang.monitor_alarm_otherAlarm, "218", "268", "otherAlarm", false, true);	//1
    }
    //Collision and rollover alarm 219
    this.fillObject(rootElement.lang.alarm_name_219, rootElement.lang.alarm_GSensor_type, "219", "269", "gSensor", false, true);	//1
    //Night driving alarm 151
    this.fillObject(rootElement.lang.alarm_name_151, rootElement.lang.offline_early_morning_alarm, "151", "152", "offlineEarlyMorningAlarm", false, true);	//1
    //Speed ​​alarm 11
    this.fillObject(rootElement.lang.alarm_name_11, rootElement.lang.over_speed_alarm, "11", "61", "speendAlarm", false, true);	//1
    //Illegal door opening alarm 6
    this.fillObject(rootElement.lang.alarm_name_6, rootElement.lang.monitor_alarm_operate, "6", "56", "operateAlarm", false, true);	//1
    //Regional speed alarm (generated by the platform) 300
    this.fillObject(rootElement.lang.alarm_name_300, rootElement.lang.over_speed_alarm, "300", "350", "speendAlarm", false, true);	//1
    //Regional low speed alarm (generated by the platform) 301
    this.fillObject(rootElement.lang.alarm_name_301, rootElement.lang.monitor_alarm_platform, "301", "351", "platformAlarm", false, true);	//1
    //Entering and exiting the area (generated by the platform) 302
    this.fillObject(rootElement.lang.alarm_name_302, rootElement.lang.monitor_alarm_platform, "302", "352", "platformAlarm", true, true);	//1
    //Line offset (generated by platform) 303
    this.fillObject(rootElement.lang.alarm_name_303, rootElement.lang.monitor_alarm_platform, "303", "353", "platformAlarm", false, true);	//1
    //Time period overspeed alarm (generated by the platform) 304
    this.fillObject(rootElement.lang.alarm_name_304, rootElement.lang.over_speed_alarm, "304", "354", "speendAlarm", false, true);	//1
    //Low speed alarm during time period (generated by platform) 305
    this.fillObject(rootElement.lang.alarm_name_305, rootElement.lang.monitor_alarm_platform, "305", "355", "platformAlarm", false, true);	//1
    //Drowsy driving (generated by the platform) 306
    this.fillObject(rootElement.lang.alarm_name_306_default, rootElement.lang.fatigueAlarm, "306", "356", "tiredAlarm", false, true);	//1
    //Timeout parking (generated by the platform) 307
    this.fillObject(rootElement.lang.alarm_name_307, rootElement.lang.monitor_alarm_platform, "307", "357", "platformAlarm", false, true);	//1
    //Key point monitoring alarm (generated by the platform) 308
    this.fillObject(rootElement.lang.alarm_name_308, rootElement.lang.monitor_alarm_platform, "308", "358", "platformAlarm", false, true);	//1
    //Line speed alarm (generated by the platform) 309
    this.fillObject(rootElement.lang.alarm_name_309, rootElement.lang.over_speed_alarm, "309", "359", "speendAlarm", false, true);	//1
    //Line low speed alarm (generated by the platform) 310
    this.fillObject(rootElement.lang.alarm_name_310, rootElement.lang.monitor_alarm_platform, "310", "360", "platformAlarm", false, true);	//1
    //Road level speed alarm (generated by the platform) 311
    this.fillObject(rootElement.lang.alarm_name_311, rootElement.lang.over_speed_alarm, "311", "361", "speendAlarm", false, true);	//1
    //Drowsy driving 49
    this.fillObject(rootElement.lang.alarm_name_49, rootElement.lang.fatigueAlarm, "49", "99", "tiredAlarm", false, true);	//1
    //Speeding at night (generated by platform) 314
    this.fillObject(rootElement.lang.alarm_name_314, rootElement.lang.over_speed_alarm, "314", "364", "speendAlarm", false, true);	//1

    //2018-07-23 Added drop-down selection to mainly modify the police statistics report
    //Positioning exception 136 countStr40
    this.fillObject(rootElement.lang.alarm_name_136, rootElement.lang.offline_early_morning_alarm, "136", "", "offlineEarlyMorningAlarm", false, true);	//1
    if (rootElement.myUserRole && !rootElement.myUserRole.isShieldReport()) {
        //Device unlock 182 countStr41
        this.fillObject(rootElement.lang.alarm_name_182, rootElement.lang.monitor_alarm_otherAlarm, "182", "232", "otherAlarm", false, false);	//1
        //Device locked 183 countStr42
        this.fillObject(rootElement.lang.alarm_name_183, rootElement.lang.monitor_alarm_otherAlarm, "183", "233", "otherAlarm", false, false);	//1
        //Low oxygen concentration 192 countStr43
        this.fillObject(rootElement.lang.alarm_name_192, rootElement.lang.monitor_alarm_otherAlarm, "192", "193", "otherAlarm", false, true);	//1
        //Other video equipment failure alarm 244 countStr44
        this.fillObject(rootElement.lang.alarm_name_244, rootElement.lang.monitor_alarm_otherAlarm, "244", "294", "otherAlarm", false, true);	//Other video equipment failure alarms
        //Special alarm video reaches the storage threshold alarm 245 countStr45
        this.fillObject(rootElement.lang.alarm_name_245, rootElement.lang.monitor_alarm_otherAlarm, "245", "295", "otherAlarm", false, true);	//Special alarm: The recording reaches the storage threshold alarm.
        //Smoke alarm 194 countStr46
        this.fillObject(rootElement.lang.alarm_name_194, rootElement.lang.monitor_alarm_otherAlarm, "194", "195", "otherAlarm", false, true);  //Smoke alarm
        //Abnormal driving 248 countStr47
        this.fillObject(rootElement.lang.abnormal_drive, rootElement.lang.monitor_alarm_otherAlarm, "248", "298", "otherAlarm", false, true);  //Abnormal driving
    }
    //TODO police statistics
    this.fillObject(rootElement.lang.alarm_name_428, rootElement.lang.over_speed_alarm, "428", "478", "speendAlarm", false, true);	//1
    this.fillObject(rootElement.lang.alarm_name_712, rootElement.lang.monitor_alarm_fault, "712", "762", "faultAlarm", false, true);	//1
    //Fatigue driving warning
    this.fillObject(rootElement.lang.alarm_name_429, rootElement.lang.fatigueAlarm, "429", "479", "tiredAlarm", false, true);
    //ACC signal abnormal alarm (platform)
    this.fillObject(rootElement.lang.alarm_name_326, rootElement.lang.monitor_alarm_platform, "326", "376", "platformAlarm", false, true);	//1
    //Location information abnormal alarm (platform)
    this.fillObject(rootElement.lang.alarm_name_327, rootElement.lang.monitor_alarm_platform, "327", "377", "platformAlarm", false, true);	//1
    //Vehicle long-term abnormal offline reminder (platform)
    this.fillObject(rootElement.lang.alarm_name_328, rootElement.lang.monitor_alarm_platform, "328", "378", "platformAlarm", false, true);	//1
    //Facial fatigue 249
    this.fillObject(rootElement.lang.alarm_name_249, rootElement.lang.monitor_alarm_adas, "249", "299", "adasAlarm", false, true);	//1
    //forward collision warning
    this.fillObject(rootElement.lang.alarm_name_430, rootElement.lang.monitor_alarm_adas, "430", "480", "adasAlarm", false, true);
    //Lane departure warning
    this.fillObject(rootElement.lang.alarm_name_431, rootElement.lang.monitor_alarm_adas, "431", "481", "adasAlarm", false, true);
    //Tire pressure warning
    this.fillObject(rootElement.lang.alarm_name_432, rootElement.lang.monitor_alarm_adas, "432", "482", "adasAlarm", false, true);
    //Rollover warning
    this.fillObject(rootElement.lang.alarm_name_433, rootElement.lang.monitor_alarm_adas, "433", "483", "adasAlarm", false, true);
    //Driving illegally
    this.fillObject(rootElement.lang.alarm_name_713, rootElement.lang.monitor_alarm_adas, "713", "763", "adasAlarm", false, true);
    //Right turn blind spot abnormality alarm
    this.fillObject(rootElement.lang.alarm_name_714, rootElement.lang.monitor_alarm_adas, "714", "764", "adasAlarm", false, true);
}


//Add alarmObject
AlarmManager.prototype.addAlarmObject = function (alarmObject) {
    var lstClass = this.lstAlarmClassify;
    var classType = alarmObject.classify;
    var isExist = true;//Does it already exist
    if (alarmObject.isVehicle) {
        isExist = false;//By default, current data can be added
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

//Initialize alarm type tree
//Type 1 is linkage alarm 2 blocks linkage 809:809 alarm
//type 1 alarm type is saved as the start alarm type. 2 alarm type is saved as the alarm start type and alarm end type.
AlarmManager.prototype.initAlarmTree = function (type, element,width,height) {
    //load tree tree
    var that = this;
    if (!element) {
        element = "alarm_tree";
    }
    var alarmTree = new dhtmlXTreeObject(element, width||"100%", height||"100%", 0);
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
        //Save category
        for (var i = 0; i < that.lstAlarmClassify.length; i++) {
            alarmTree.insertNewItem("0", that.lstAlarmClassify[i].id, that.lstAlarmClassify[i].name, 0, "all_group.gif", "all_group.gif", "all_group.gif", 'SELECT');
        }
        //Save to the corresponding category
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
    //Filtered data {}
    //Adopting the second style
    if (width && height){
        alarmTree.addSearchInputV2(data, element);
    }else {
        alarmTree.addSearchInput(data, element);
    }
    return alarmTree;
};

/**
 *
 * @param type
 * @param element
 * @param width
 * @param height
 * @param imgPath ../../js/dxtree/imgs/
 * @param ifCheck 1=>open 0=>close
 * @param ifThree true => three icon
 * @param clsArr className for icon [docu,open,close]
 * @param nodeImgs node icon size:2  open or close
 * @Param checkboxImgs  checkbox icon size:2  select or unselect
 * @Param imgs size:3 => image1 - image for node without children; (optional)
 *                       image2 - image for closed node; (optional)
 *                       image3 - image for opened node (optional)
 *
 * @returns {dhtmlXTreeObject|dhtmlXTreeObject}
 */
AlarmManager.prototype.initAlarmTreeForCustomIcon = function (type, element,width,height,imgPath,ifCheck,ifThree,clsArr,nodeImgs,checkboxImgs,imgs) {
    //load tree tree
    var that = this;
    if (!element) {
        element = "alarm_tree";
    }
    var alarmTree = new dhtmlXTreeObject(element, width||"100%", height||"100%", 0);
    alarmTree.setImagePath(imgPath);
    alarmTree.enableCheckBoxes(ifCheck);
    alarmTree.enableThreeStateCheckboxes(ifThree);

    if(nodeImgs){
        alarmTree.setImageArrays("plus",nodeImgs[0], nodeImgs[0], nodeImgs[0], nodeImgs[0], nodeImgs[0], nodeImgs[0])
        alarmTree.setImageArrays("minus",nodeImgs[1], nodeImgs[1], nodeImgs[1], nodeImgs[1], nodeImgs[1], nodeImgs[1])
    }
    if(checkboxImgs){
        alarmTree.checkArray = new Array(checkboxImgs[1], checkboxImgs[0], checkboxImgs[0], checkboxImgs[1], checkboxImgs[0], checkboxImgs[0]);
    }
    alarmTree.lineArray = new Array("blank.gif", "blank.gif", "blank.gif", "blank.gif", "blank.gif", "blank.gif");
    if(!imgs){
        imgs = [null,null,null]
        alarmTree.imageArray = ['','',''] ;
    }

    var data = [];
    //Save category
    for (var i = 0; i < that.lstAlarmClassify.length; i++) {
        alarmTree.insertNewItem("0", that.lstAlarmClassify[i].id, that.lstAlarmClassify[i].name, 0, '','','', 'SELECT',clsArr);
    }
    //Save to the corresponding category
    for (var j = 0; j < that.lstAlarmTypeOjbect.length; j++) {
        if (that.lstAlarmTypeOjbect[j].isVehicle) {
            if (type == 1) {
                data.push({id: that.lstAlarmTypeOjbect[j].armType, name: that.lstAlarmTypeOjbect[j].name});
                alarmTree.insertNewItem(that.lstAlarmTypeOjbect[j].classify, that.lstAlarmTypeOjbect[j].armType, that.lstAlarmTypeOjbect[j].name, 0, imgs[0], imgs[1],imgs[2], 'SELECT',clsArr);
            } else if (type == 2) {
                data.push({id: that.lstAlarmTypeOjbect[j].realType, name: that.lstAlarmTypeOjbect[j].name});
                alarmTree.insertNewItem(that.lstAlarmTypeOjbect[j].classify, that.lstAlarmTypeOjbect[j].realType, that.lstAlarmTypeOjbect[j].name, 0, imgs[0], imgs[1],imgs[2], 'SELECT',clsArr);
            }
        }
    }
    alarmTree.closeAllItems();

    if (width && height){
        alarmTree.addSearchInputV2(data, element);
    }else {
        alarmTree.addSearchInput(data, element);
    }
    return alarmTree;

}



//Initialize alarm type array
AlarmManager.prototype.initAlarmTypes = function (containsEnd) {
    var that = this;
    var alarmTypes = [];
    var allTypes = [];
    if (rootElement.myUserRole && rootElement.myUserRole.isPolice()) {
        for (var i = 0; i < that.lstAlarmTypeOjbect.length; i++) {
            if (that.lstAlarmTypeOjbect[i].isPolice) {
                allTypes.push(that.lstAlarmTypeOjbect[i].armType);
                if(containsEnd && that.lstAlarmTypeOjbect[i].armEnd){
                    allTypes.push(that.lstAlarmTypeOjbect[i].armEnd);
                }
            }
        }
        if (allTypes.length > 0) {
            alarmTypes.push({id: allTypes.join(','), name: rootElement.lang.all});
        }
        for (var i = 0; i < that.lstAlarmTypeOjbect.length; i++) {
            if (that.lstAlarmTypeOjbect[i].isPolice) {
                alarmTypes.push({id: that.lstAlarmTypeOjbect[i].armType, name: that.lstAlarmTypeOjbect[i].name});
                that.allId.push(that.lstAlarmTypeOjbect[i].armType);
                if(containsEnd && that.lstAlarmTypeOjbect[i].armEnd){
                    alarmTypes.push({id: that.lstAlarmTypeOjbect[i].armEnd, name: that.lstAlarmTypeOjbect[i].name});
                    that.allId.push(that.lstAlarmTypeOjbect[i].armEnd);
                }
            }
        }
    } else {
        for (var i = 0; i < that.lstAlarmTypeOjbect.length; i++) {
            if (that.lstAlarmTypeOjbect[i].isVehicle) {
                allTypes.push(that.lstAlarmTypeOjbect[i].armType);
                if(containsEnd && that.lstAlarmTypeOjbect[i].armEnd){
                    allTypes.push(that.lstAlarmTypeOjbect[i].armEnd);
                }
            }
        }
        if (allTypes.length > 0) {
            alarmTypes.push({id: allTypes.join(','), name: rootElement.lang.all});
        }
        for (var i = 0; i < that.lstAlarmTypeOjbect.length; i++) {
            if (that.lstAlarmTypeOjbect[i].isVehicle) {
                alarmTypes.push({id: that.lstAlarmTypeOjbect[i].armType, name: that.lstAlarmTypeOjbect[i].name});
                that.allId.push(that.lstAlarmTypeOjbect[i].armType);
                if(containsEnd && that.lstAlarmTypeOjbect[i].armEnd){
                    alarmTypes.push({id: that.lstAlarmTypeOjbect[i].armEnd, name: that.lstAlarmTypeOjbect[i].name});
                    that.allId.push(that.lstAlarmTypeOjbect[i].armEnd);
                }
            }
        }
    }
    return alarmTypes;
}

AlarmManager.prototype.getArmEnd = function (alarmStart) {
    if (!alarmStart){
        return null;
    }
    for (var i = 0,len = this.lstAlarmTypeOjbect.length; i < len; i++) {
        if (this.lstAlarmTypeOjbect[i].armType == alarmStart){
            return this.lstAlarmTypeOjbect[i].armEnd;
        }
    }
}

/**
 * When offline alarm is checked
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
    //Handle business
    var dealBus = function (nodeId) {
        if (nodeId && nodeId == 67) {
            hideVideoBus();
        } else {
            showVideoBus();
        }
    }

    var onTreeClick = function () {
        //Get selected node
        var nodeId = tree.getSelectedItemId();
        //If only the selected device is offline, the video service will be blocked.
        dealBus(nodeId);
    }

    var onSelectFun = function () {
        //Get the selected node excluding the parent node
        var clickNode = tree.getAllChecked();
        dealBus(clickNode);
    }

    $('.dhx_bg_img_fix').on('click', onSelectFun);

    tree.attachEvent("onClick", onTreeClick);
}

/**
 * Exclude alarm
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
 * Exclude alarm classification
 */
AlarmManager.prototype.excluedAlarmClassify = function (classify) {
    if (!classify) {
        return;
    }
    this.lstAlarmClassify = this.lstAlarmClassify.filter(function (val, index, arr) {
        return !classify.contains(val.id);
    })
}


/**
 * Initialize the Tab box
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
            title: {display: displayLang, pid: 0, pclass: 'clearfix', hide: false, tabshide: false},
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
 * Convert to report drop-down tree data format
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
    var isPolice = rootElement.myUserRole && rootElement.myUserRole.isPolice();
    var lstAlarmArray = this.lstAlarmTypeOjbect.filter(function(item,index,arr){
        return isPolice ? item.isPolice : true;
    })

    if (!lstAlarmArray || lstAlarmArray.length === 0) {
        return alarmArr;
    }
    var alarmParentObj = {};

    for (var i = 0,len = lstAlarmArray.length; i < len; i++) {
        var alarmTypeOjbect = lstAlarmArray[i];
        alarmTypeOjbect.checked = true;
        alarmTypeOjbect.open = true;
        alarmTypeOjbect.id = alarmTypeOjbect.armType;
        /*alarmTypeOjbect.pId = alarmTypeOjbect.parentName;
        alarmParentObj[alarmTypeOjbect.parentName] = alarmTypeOjbect.parentName;*/
        alarmTypeOjbect.pId = alarmTypeOjbect.classify;
        if (alarmParentObj[alarmTypeOjbect.classify]) {
            continue;
        }
        alarmParentObj[alarmTypeOjbect.classify] = alarmTypeOjbect.parentName;
    }

    var alarmParentArr = [];
    for (var alarmParentKey in alarmParentObj) {
        alarmParentArr.push({
            checked: true,
            id: alarmParentKey,
            name: alarmParentObj[alarmParentKey],
            open: true,
            pId: 0
        })
    }
    alarmArr = alarmArr.concat(alarmParentArr);
    alarmArr = alarmArr.concat(lstAlarmArray);
    return alarmArr;
}


/**
 * Get proactive security alerts (including events)
 * @returns {beginType，endType， classify}
 */
AlarmManager.prototype.getSafetyAlarmClass = function () {
    var that = this;
    //Put all alarms in
    var safetyAlarms = [];
    if (that.lstAlarmTypeOjbect && that.lstAlarmTypeOjbect.length > 0) {
        for (var i = 0; i < that.lstAlarmTypeOjbect.length; i++) {
            var classify = that.lstAlarmTypeOjbect[i].classify;
            if (classify == "activeSafetyZnjc" || classify == "activeSafetyFierce" ||
                classify == "activeSafetyProximity" || classify == "activeSafetyTmps" ||
                classify == "activeSafetyDsm" || classify == "activeSafetyAdas" || classify == "activeSafetySatellite" ||
                classify == "activeSafetyDriverIdentification" || classify == "activeSafetyVehicleOperationMonitoring" ||
                classify == "activeSafetyEquipmentFailureMonitoring" || classify == "safetyPlatformAlarm" || classify == "activeSafetyActiveBraking" ||
                classify == "activeSafetyOther") {
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
