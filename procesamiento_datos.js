'use strict';
//Librerias
const readline = require('readline');
var mqtt = require('mqtt');
var S = require('string');
var math = require('mathjs');
var moment = require('moment');

//Variables conexion mediante MQTT
var topic_1;
var array_subtopics = [];
var array_alarmas = [];
var contador_topics = 0;
var publish_topic1,publish_topic2;
var settings = { //Nuevo
  keepalive:1000,
  port:1883
}
var client = mqtt.connect('mqtt://127.0.0.1',settings);
var client_publish_and_manager= mqtt.connect('mqtt://iot.eclipse.org',settings); //Cliente para recibir órdenes del técnico y enviar alarmas
//Nos subscribimos al topic que recibe datos del técnico (en este caso cambio de umbral de detección)
client_publish_and_manager.subscribe('cambio_umbral');


//Variables del programa
var umbral = 7; //Valor por defecto
var tiempo;

//Creamos interfaz para leer desde teclado
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

//Preguntamos y almacenamos el valor tecleadoclient_publishclient_publish
rl.question('Introduce topic generico : ', (answer1) => {
      rl.question('Introduce topic donde publicar : ', (answer3) => {
            publish_topic1 = answer1 +'/'+answer3;
            topic_1 = answer1 +'/#';
            console.log('Topic generico de envio : ' + topic_1);
            console.log('Introducidos topics donde publicar: '+ publish_topic1 );
            client.subscribe(topic_1);

        });
});


//MQTT
//Recepción de datos por parte del programa receptor de datos de los sensortags
client.on('message', (topic, message) => {
    var i = 0;
    var mensaje_recibido;
    var media_cuadratica = 0;
    //Bucle para añadir los topics al array de topics
    while(i<contador_topics+1){
        if( array_subtopics[i]==topic){
          i= contador_topics+2; //Break manual
        }else if( array_subtopics[i]==undefined){
          array_subtopics[i]=topic;
          contador_topics++;
          console.log('Topic añadido ' + array_subtopics[i]);
          i = contador_topics+2; //Break manual
        }
        i++;
    }
    //Separamos en función de que topic hemos recibido
    for (var j = 0;j<contador_topics+1; j++){
      if(topic == array_subtopics[j]){
        mensaje_recibido = JSON.parse(message);
        media_cuadratica = math.sqrt((mensaje_recibido.ejex*mensaje_recibido.ejex)+(mensaje_recibido.ejey*mensaje_recibido.ejey)+(mensaje_recibido.ejez*mensaje_recibido.ejez));
        if(media_cuadratica > umbral){
          console.log('\tAlarma proveniente del topic ' + topic + ' en el tiempo '+ mensaje_recibido.tiempo );
          comprobacion_alarma(j,mensaje_recibido.tiempo);
        }
      }
    }
});


function comprobacion_alarma(posicion_array,timestamp){
  //Almacenamos valor en array de alarmas
  var contador = 0;
  array_alarmas[posicion_array] = timestamp;
  for(var i=0;i<contador_topics;i++){
    if(i!=posicion_array && array_alarmas[i]!=undefined){
      var diferencia_timestamp = array_alarmas[posicion_array] - array_alarmas[i];
      if(diferencia_timestamp < 1000){
        contador++;
      }
    }
  }
  if(contador==contador_topics-1){
    console.log('Alarma producida por todo el sistema');
    tiempo = moment().format('LLLL');
    client_publish_and_manager.publish(publish_topic1,tiempo + ' Alarma de todo el sistema');
  }else if(contador<contador_topics -1 && contador !=0){
    console.log('Alarma producida por varios sensortags');
    tiempo = moment().format('LLLL');
    client_publish_and_manager.publish(publish_topic1, tiempo + ' Alarma compuesta ');
  }
  contador=0;
}


//Recepción de datos por parte del técnico
client_publish_and_manager.on('message',(topic,message) => {
  if(topic=="cambio_umbral"){
    //Máximo rango configurado 8g
    umbral = parseInt(message,10);
    if(umbral >8){
      umbral =8;
    }else if (umbral<0){
      umbral = 1;
    }
    console.log('Umbral de detección modificado al valor ' + umbral);
  }
});
