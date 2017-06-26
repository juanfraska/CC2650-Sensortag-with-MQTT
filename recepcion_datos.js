'use strict';
//Bibliotecas
var async = require('async');
var SensorTag = require('sensortag');
var moment  = require('moment');
var NobleDevice = require('noble-device');
var LineByLineReader = require('line-by-line'),
lr = new LineByLineReader('/home/estudiante/my_node/config.txt');
var lineReader = require('line-reader');
var string = require('string');
var mqtt = require('mqtt');

// Variables del timer
var timeoutVar = 1600000;
var timeoutVarBattery = 5000;
var timeoutID,timeoutBattery;
var timeoutCleared = true;
var num_sensores = 0;
// Direcciiones MAC de los sensortags
var direccionMAC = [];

// Duplicados permitidos -> Reconexión possible
SensorTag.SCAN_DUPLICATES = true;
NobleDevice.Util.mixin(SensorTag, NobleDevice.BatteryService);


//Variables para la comunicacion mediante mqtt
var settings = { //Nuevo
  keepalive:1000,
  port:1883
}
var client = mqtt.connect('mqtt://127.0.0.1',settings);
var client_manager = mqtt.connect('mqtt://iot.eclipse.org',settings);
var topic_publicacion; //Variable que almacena la direccion general de publicacion
var array_topic = [];
//Nos subscribimos al topic del técnico de mantenimiento
client_manager.subscribe('cambio_periodo');

//Array de sensores conectados
var array_sensores = ["Disconnected","Disconnected","Disconnected","Disconnected","Disconnected","Disconnected","Disconnected","Disconnected"];
//Variables auxiliares
var json;
var periodo =100; // ms
var tiempo_actual;
var dir_conectados = [0,0,0,0,0,0,0,0];
var j =0;

//Leemos línea a línea del fichero de configuracion para extarer los datos

lr.on('error',function(err){
  console.log("Error al abrir el archivo");
  procces.exit(0);
});
lr.on('line',function(line){
  if(line[0]!="/"){ //Evitamos líneas de comentarios
    var splitLine = line.split(" "); //Separamos por espacio
    for (var i =0;i<8; i++){
      if(i==0){
        topic_publicacion = splitLine[i].toString(); //Topic general para publicar los datos
        console.log('Topic general de publicacion: ' + topic_publicacion);
      }else if(splitLine[i] != undefined){
        num_sensores++;
        direccionMAC[i-1] = splitLine[i].toString(); //Mac sensortag
        console.log('Añadido nuevo sensortag: ' + direccionMAC[i-1]);
        array_topic[i-1] = topic_publicacion+'/'+direccionMAC[i-1];
      }
    }

  }
});
lr.on('end',function(){
  console.log("Archivo leido correctamente");
  // Buscamos sensores
  escaneo_Timer();
  run_comprobacion_bateria();
});







// Funcion que se ejecuta cuando llega una conexión
function onDiscover(sensorTag) {
  console.log('Descubierto: ' + sensorTag.uuid + ', tipo = ' + sensorTag.type + ', direccion Mac = ' + sensorTag.address);
//Paramos de descubrir hasta que logre conectarse nuestro sensortag
  stopTimer();
  //Calback de desconexión
  sensorTag.once('disconnect', function () {
    console.log('Desconectado el sensortag de direccion : ' + sensorTag.address);
    //Si nos desconectamos enviamos un mensaje de alerta por desconexión
    for(var i=0;i<3;i++){
      if(sensorTag.address == direccionMAC[i]){
        array_sensores[i]="Disconnected";
        client_manager.publish(array_topic[i],'Sensortag con MAC ' + sensorTag.address + ' se ha desconectado ');
      }
    }
    //Si hemos perdido la comunicacion volvemos a activar el escaneo para volver a reconectarnos
      stopTimer();
      escaneo_Timer();

  });
  //En el caso que se haya descubierto alguno de los sensortags asociados le enviamos la orden de conexión
  for(var i=0;i<3;i++){
    if (sensorTag.address == direccionMAC[i]){
      config_sensor(sensorTag,array_topic[i]);
      array_sensores[i] = sensorTag;
      dir_conectados[i] = sensorTag.address;
    }

  }

}

//Función de conexión y configuración del acelerómetro de los sensortags

function config_sensor(sensorTag,publish_topic){
  sensorTag.connectAndSetup(function () {
    console.log('Conexión  del sensortag ' + sensorTag.address);
    //Recepción de los datos del acelerómetro
    sensorTag.enableAccelerometer(function() {
      sensorTag.setAccelerometerPeriod(periodo, function() {
        sensorTag.notifyAccelerometer(function() {
          sensorTag.on('accelerometerChange', function(x, y, z) {
            //Tomamos tiempo
              //tiempo_actual = moment().format('"dddd, MMMM Do YYYY, h:mm:ss a"');
              tiempo_actual = moment().valueOf();
              //Convertimos a JSON los valores del acelerómetro
              json = JSON.stringify({tiempo: tiempo_actual,ejex: x.toFixed(5),ejey: y.toFixed(5), ejez: z.toFixed(5)});
              //Publicamos
              client.publish(publish_topic,json);
              //Mostramos por pantalla
              //console.log('\tx_rojo = %d G || y_rojo = %d G || z_rojo = %d G ', x.toFixed(5), y.toFixed(5),z.toFixed(5));

          });
        });
      });
    });
    //Una vez nos hemos conectado volvemos a escanear para poder conectarnos a otros dispositivos
    escaneo_Timer();
  });
}




//Timer para envío periódico del estado de la batería (timeoutVarBattery)
function run_comprobacion_bateria(){
  timeoutBattery = setTimeout(function (){
    comprobacion_bateria();
  },timeoutVarBattery);
}
//Funcion que salta cuando termina de contar el timer
function comprobacion_bateria(){
   if(array_sensores[j]!="Disconnected"){
     array_sensores[j].readBatteryLevel(function(error,nivelbateria){
       if(nivelbateria<25){
         client_manager.publish(array_topic[j],'Alarma por nivel bateria');
       }
     });
   }
   clearTimeout(timeoutBattery);
   run_comprobacion_bateria();
   j++;
   if(j>num_sensores-1){
     j = 0;
   }
}

//**************************************************************************************************************
// Empezamos a contar y descubrimos globalmente
//Timer para búsqueda de sensores
function escaneo_Timer() {
  console.log('Buscamos dispositivos');
  timeoutCleared = false;
  SensorTag.discoverAll(onDiscover);
  timeoutID = setTimeout(function () {
    stopTimer();
  }, timeoutVar);
}

//Detenemos el timer y detenemos el descubrimiento de dispositivos
function stopTimer() {
  SensorTag.stopDiscoverAll(onDiscover);
  timeoutCleared = true;
  console.log('Dejamos de buscar');
  clearTimeout(timeoutID);
}



//Zona de recepción de parámetros enviados por el técnico
client_manager.on('message',(topic,message) => {
  if (topic == "cambio_periodo"){
    periodo = parseInt(message,10);
    if(periodo > 2000){
      periodo =2000;
    }else if (periodo<50){
      periodo = 50;
    }
    for (var i = 0; i<num_sensores; i++){
      if(array_sensores[i]!="Disconnected"){
        array_sensores[i].setAccelerometerPeriod(periodo, function() {});
      }
    }
    console.log('Cambiado periodo a ' + periodo);
  }
})
