
// Configuración Firebase
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Variables globales
let DEMO_MODE = false;
let db, storage;
let firebaseInitialized = false;
let isOnline = navigator.onLine;
let photos = [];
let stream = null;
let pendingData = JSON.parse(localStorage.getItem('pendingConsultations') || '[]');

// Base de datos simulada para modo demo
const mockDatabase = {
    consultations: JSON.parse(localStorage.getItem('demoConsultations') || '[]'),
    appointments: JSON.parse(localStorage.getItem('demoAppointments') || '[]'),
    stats: {
        consultations: JSON.parse(localStorage.getItem('demoConsultations') || '[]').length,
        appointments: JSON.parse(localStorage.getItem('demoAppointments') || '[]').length
    }
};

// Inicialización de Firebase
async function initializeFirebase() {
    // Verificar si ya está inicializado
    if (firebase.apps.length > 0) {
        return firebase.app();
    }

    try {
        const app = firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        storage = firebase.storage();

        // Configuración para entornos serverless
        if (typeof window === 'undefined') {
            db.settings({
                experimentalForceLongPolling: true,
                merge: true
            });
        }

        // Habilitar persistencia offline solo en cliente
        if (typeof window !== 'undefined') {
            await db.enablePersistence({ synchronizeTabs: true })
                .catch(err => {
                    console.warn('⚠️ Persistencia offline no soportada:', err);
                });
        }

        console.log('✅ Firebase inicializado correctamente');
        return app;
    } catch (error) {
        console.error('❌ Error inicializando Firebase:', error);
        throw error;
    }
}

// Funciones de utilidad
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = 'notification';

    const colors = {
        success: '#28a745',
        warning: '#ffc107',
        error: '#dc3545',
        info: '#17a2b8'
    };

    notification.style.background = colors[type];
    if (type === 'warning') notification.style.color = '#333';

    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 4000);
}

function updateConnectionStatus() {
    const statusEl = document.getElementById('connectionStatus');
    const syncStatusEl = document.getElementById('syncStatus');
    const firestoreStatus = document.createElement('span');
    firestoreStatus.id = 'firestoreStatus';
    document.querySelector('.status-bar').appendChild(firestoreStatus);

    if (DEMO_MODE) {
        statusEl.textContent = '🎭 Modo Demo';
        statusEl.className = 'status-online';
        syncStatusEl.textContent = '🎭 MODO DEMO - Datos simulados';
        syncStatusEl.style.background = '#6f42c1';
    } else if (isOnline && firebaseInitialized) {
        statusEl.textContent = '● Conectado a Firebase';
        statusEl.className = 'status-online';
        syncStatusEl.textContent = '✓ En línea - Firebase conectado';
        syncStatusEl.style.background = '#28a745';
    } else if (isOnline) {
        statusEl.textContent = '⚠️ Conectado (Firebase error)';
        statusEl.className = 'status-offline';
        syncStatusEl.textContent = '⚠️ Error Firebase - Modo offline';
        syncStatusEl.style.background = '#ffc107';
    } else {
        statusEl.textContent = '● Sin conexión';
        statusEl.className = 'status-offline';
        syncStatusEl.textContent = '⚠️ Sin conexión - Modo offline';
        syncStatusEl.style.background = '#dc3545';
    }
    if (firebaseInitialized) {
        firestoreStatus.textContent = '● Firestore: Conectado';
        firestoreStatus.className = 'status-online';
    } else {
        firestoreStatus.textContent = '● Firestore: Error';
        firestoreStatus.className = 'status-offline';
    }
}

function updatePendingCount() {
    const pendingCount = DEMO_MODE ? 0 : pendingData.length;
    document.getElementById('pendingItems').textContent = `Pendientes: ${pendingCount}`;
}

function updateStats() {
    const statsEl = document.getElementById('statsInfo');
    if (DEMO_MODE) {
        statsEl.textContent = `📊 Consultas: ${mockDatabase.stats.consultations} | Citas: ${mockDatabase.stats.appointments}`;
    } else {
        statsEl.textContent = `📊 Pendientes: ${pendingData.length} | Estado: ${firebaseInitialized ? 'Conectado' : 'Offline'}`;
    }
}

// Funciones de cámara
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: 'environment' },
            audio: false
        });

        const video = document.getElementById('cameraPreview');
        video.srcObject = stream;
        video.style.display = 'block';
        document.getElementById('takePhotoBtn').style.display = 'inline-block';

        showNotification('📷 Cámara iniciada correctamente');

    } catch (error) {
        console.error('Error al acceder a la cámara:', error);
        alert('❌ Error al acceder a la cámara: ' + error.message);
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        document.getElementById('cameraPreview').style.display = 'none';
        document.getElementById('takePhotoBtn').style.display = 'none';
        showNotification('📷 Cámara detenida');
    }
}

function takePhoto() {
    const video = document.getElementById('cameraPreview');
    const canvas = document.getElementById('photoCanvas');
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    // Comprimir imagen
    const dataURL = canvas.toDataURL('image/jpeg', 0.7);

    const photo = {
        id: Date.now(),
        type: document.getElementById('photoType').value,
        data: dataURL,
        timestamp: new Date().toISOString(),
        size: Math.round(dataURL.length * 0.75) // Aproximar tamaño en bytes
    };

    photos.push(photo);
    displayPhotos();
    showNotification(`📸 Foto capturada (${Math.round(photo.size / 1024)}KB)`);
}

function displayPhotos() {
    const gallery = document.getElementById('photoGallery');
    gallery.innerHTML = '';

    photos.forEach((photo, index) => {
        const div = document.createElement('div');
        div.className = 'photo-item';
        div.innerHTML = `
    <img src="${photo.data}" alt="${photo.type}">
        <small>${photo.type} - ${Math.round(photo.size / 1024)}KB</small>
        <button onclick="removePhoto(${index})" style="position: absolute; top: 5px; right: 5px; background: red; color: white; border: none; border-radius: 50%; width: 25px; height: 25px; cursor: pointer;">×</button>
        `;
        gallery.appendChild(div);
    });
}

function removePhoto(index) {
    if (confirm('¿Eliminar esta foto?')) {
        photos.splice(index, 1);
        displayPhotos();
        showNotification('🗑️ Foto eliminada');
    }
}

// Funciones de consulta
async function saveConsultation() {
    // Validar datos mínimos
    const patientName = document.getElementById('patientFullName').value.trim();
    if (!patientName) {
        alert('❌ Por favor ingresa el nombre del paciente');
        return;
    }

    console.log('💾 Guardando consulta...');

    const consultation = {
        id: Date.now(),
        patient: {
            name: patientName,
            age: document.getElementById('age').value || null,
            gender: document.getElementById('gender').value || null
        },
        vitals: {
            bloodPressure: document.getElementById('bloodPressure').value || null,
            temperature: document.getElementById('temperature').value || null,
            heartRate: document.getElementById('heartRate').value || null,
            oxygenSat: document.getElementById('oxygenSat').value || null
        },
        symptoms: document.getElementById('symptoms').value || '',
        observations: document.getElementById('observations').value || '',
        urgencyLevel: document.getElementById('urgencyLevel').value || 'baja',
        photos: photos,
        timestamp: new Date().toISOString(),
        synced: false,
        location: 'Centro de Salud Rural' // Esto podría obtenerse por GPS
    };

    try {
        if (DEMO_MODE) {
            // Modo demo: guardar en almacenamiento local simulado
            mockDatabase.consultations.push({ ...consultation, synced: true });
            mockDatabase.stats.consultations++;
            localStorage.setItem('demoConsultations', JSON.stringify(mockDatabase.consultations));

            showNotification('✅ Consulta guardada en modo demo');
            alert('✅ Consulta guardada exitosamente en modo DEMO');

        } else if (isOnline && firebaseInitialized) {
            // Intentar guardar directamente en Firebase
            showNotification('☁️ Guardando en Firebase...');
            await saveToFirebase(consultation);
            showNotification('✅ Consulta sincronizada con Firebase');
            alert('✅ Consulta guardada y sincronizada con Firebase');

        } else {
            // Guardar localmente para sincronizar después
            pendingData.push(consultation);
            localStorage.setItem('pendingConsultations', JSON.stringify(pendingData));
            updatePendingCount();
            document.getElementById('pendingSync').style.display = 'block';

            const reason = !isOnline ? 'sin conexión' : 'error de Firebase';
            showNotification(`📱 Consulta guardada localmente (${reason})`, 'warning');
            alert(`📱 Consulta guardada localmente (${reason})\nSe sincronizará automáticamente cuando sea posible.`);
        }

        // Limpiar formulario después de guardar
        if (confirm('¿Deseas limpiar el formulario para una nueva consulta?')) {
            clearForm();
        }

    } catch (error) {
        console.error('❌ Error guardando consulta:', error);

        // Fallback: guardar localmente
        pendingData.push(consultation);
        localStorage.setItem('pendingConsultations', JSON.stringify(pendingData));
        updatePendingCount();
        document.getElementById('pendingSync').style.display = 'block';

        showNotification('⚠️ Error - consulta guardada localmente', 'error');
        alert('⚠️ Error de conexión - consulta guardada localmente para sincronizar después');
    }

    updateStats();
}

async function saveToFirebase(consultation) {
    if (!firebaseInitialized || !db) {
        throw new Error('Firebase no está inicializado');
    }

    try {
        console.log('☁️ Guardando en Firebase...');

        const docRef = db.collection('consultations').doc(consultation.id.toString());

        // Subir fotos a Firebase Storage si las hay
        const photoUrls = [];
        if (consultation.photos && consultation.photos.length > 0) {
            console.log(`📸 Subiendo ${consultation.photos.length} fotos...`);

            for (let i = 0; i < consultation.photos.length; i++) {
                const photo = consultation.photos[i];
                try {
                    const photoUrl = await uploadPhotoToStorage(photo, consultation.id);
                    photoUrls.push({
                        id: photo.id,
                        type: photo.type,
                        url: photoUrl,
                        timestamp: photo.timestamp,
                        size: photo.size
                    });
                    console.log(`✅ Foto ${i + 1}/${consultation.photos.length} subida`);
                } catch (error) {
                    console.error(`❌ Error subiendo foto ${photo.id}:`, error);
                    // Mantener la foto en base64 como fallback
                    photoUrls.push(photo);
                }
            }
        }

        // Crear documento de consulta
        const consultationData = {
            ...consultation,
            photos: photoUrls,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            synced: true
        };

        await docRef.set(consultationData);

        // Actualizar estadísticas del sistema
        await updateSystemStats('consultations');

        console.log('✅ Consulta guardada exitosamente en Firebase');

    } catch (error) {
        console.error('❌ Error guardando en Firebase:', error);
        throw error;
    }
}

async function uploadPhotoToStorage(photo, consultationId) {
    try {
        const blob = dataURLtoBlob(photo.data);
        const fileName = `consultation_${consultationId}_photo_${photo.id}.jpg`;
        const ref = storage.ref(`photos/${fileName}`);

        const snapshot = await ref.put(blob);
        const downloadURL = await snapshot.ref.getDownloadURL();

        return downloadURL;
    } catch (error) {
        console.error('Error subiendo foto:', error);
        throw error;
    }
}

function dataURLtoBlob(dataURL) {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

async function updateSystemStats(type) {
    if (!firebaseInitialized) return;

    try {
        const configRef = db.collection('system_config').doc('app_info');

        if (type === 'consultations') {
            await configRef.set({
                total_consultations: firebase.firestore.FieldValue.increment(1),
                last_consultation: firebase.firestore.FieldValue.serverTimestamp(),
                version: '2.0.0'
            }, { merge: true });
        } else if (type === 'appointments') {
            await configRef.set({
                total_appointments: firebase.firestore.FieldValue.increment(1),
                last_appointment: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
    } catch (error) {
        console.error('Error actualizando estadísticas:', error);
    }
}

// Funciones de sincronización
async function syncData() {
    if (DEMO_MODE) {
        showNotification('🎭 En modo demo - no hay datos para sincronizar');
        return;
    }

    if (!isOnline) {
        showNotification('❌ Sin conexión a Internet', 'error');
        return;
    }

    if (pendingData.length === 0) {
        showNotification('✅ No hay datos pendientes para sincronizar');
        return;
    }

    if (!firebaseInitialized) {
        showNotification('🔄 Reconnectando a Firebase...');
        const connected = await initializeFirebase();
        if (!connected) {
            showNotification('❌ No se pudo conectar a Firebase', 'error');
            return;
        }
    }

    try {
        console.log(`🔄 Sincronizando ${pendingData.length} consultas pendientes...`);
        showNotification(`🔄 Sincronizando ${pendingData.length} consultas...`);

        let syncedCount = 0;
        let errorCount = 0;
        const failedConsultations = [];

        for (let i = 0; i < pendingData.length; i++) {
            const consultation = pendingData[i];
            try {
                await saveToFirebase(consultation);
                syncedCount++;
                console.log(`✅ Consulta ${consultation.id} sincronizada (${i + 1}/${pendingData.length})`);
            } catch (error) {
                errorCount++;
                failedConsultations.push(consultation);
                console.error(`❌ Error sincronizando consulta ${consultation.id}:`, error);
            }
        }

        if (syncedCount > 0) {
            // Mantener solo las consultas que fallaron
            pendingData = failedConsultations;
            localStorage.setItem('pendingConsultations', JSON.stringify(pendingData));
            updatePendingCount();

            if (pendingData.length === 0) {
                document.getElementById('pendingSync').style.display = 'none';
            }

            const message = errorCount === 0
                ? `✅ ${syncedCount} consultas sincronizadas exitosamente`
                : `⚠️ ${syncedCount} sincronizadas, ${errorCount} fallaron`;

            showNotification(message, errorCount === 0 ? 'success' : 'warning');
            alert(message);
        } else {
            showNotification('❌ No se pudieron sincronizar las consultas', 'error');
            alert('❌ Error: No se pudieron sincronizar las consultas');
        }

    } catch (error) {
        console.error('❌ Error en sincronización:', error);
        showNotification('❌ Error general en sincronización', 'error');
        alert('❌ Error al sincronizar datos: ' + error.message);
    }

    updateStats();
}

// Funciones de video consulta
function startVideoCall() {
    showNotification('🎥 Iniciando videollamada...');

    // En un entorno real, aquí se integraría con WebRTC, Zoom SDK, Google Meet, etc.
    const iframe = document.getElementById('videoFrame');

    // Simulación de videollamada
    iframe.src = 'about:blank';
    iframe.style.display = 'block';
    iframe.style.background = '#000';

    iframe.onload = function () {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100vh; color: white; font-family: Arial, sans-serif; text-align: center; background: linear-gradient(135deg, #667eea, #764ba2);">
            <div>
                <h2>🎥 Videollamada Simulada</h2>
                <p>En un entorno real, aquí se mostraría la videollamada</p>
                <p style="margin-top: 20px; font-size: 14px; opacity: 0.8;">
                    Integrar con: WebRTC, Zoom SDK, Google Meet API, Jitsi Meet
                </p>
                <button onclick="parent.endVideoCall()" style="margin-top: 20px; padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    Finalizar Llamada
                </button>
            </div>
        </div>
        `;
    };
}

function endVideoCall() {
    document.getElementById('videoFrame').style.display = 'none';
    showNotification('📞 Videollamada finalizada');
}

function scheduleCall() {
    // Configurar fecha mínima (hoy)
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('consultationDate').min = today;
    document.getElementById('scheduleModal').style.display = 'flex';
}

function closeScheduleModal() {
    document.getElementById('scheduleModal').style.display = 'none';
}

async function confirmSchedule() {
    const date = document.getElementById('consultationDate').value;
    const time = document.getElementById('consultationTime').value;
    const specialist = document.getElementById('specialistType').value;
    const notes = document.getElementById('consultationNotes').value;
    const patientName = document.getElementById('patientFullName').value.trim();

    if (!date || !time) {
        alert('❌ Por favor selecciona fecha y hora');
        return;
    }

    if (!patientName) {
        alert('❌ Por favor ingresa el nombre del paciente');
        return;
    }

    // Validar que la fecha no sea anterior a hoy
    const selectedDateTime = new Date(date + 'T' + time);
    const now = new Date();

    if (selectedDateTime < now) {
        alert('❌ No puedes programar una consulta en el pasado');
        return;
    }

    const appointmentId = Date.now();
    const appointment = {
        id: appointmentId,
        patientName: patientName,
        date: date,
        time: time,
        specialist: specialist,
        notes: notes,
        timestamp: new Date().toISOString(),
        status: 'programada',
        urgencyLevel: document.getElementById('urgencyLevel').value || 'baja'
    };

    try {
        if (DEMO_MODE) {
            // Modo demo
            mockDatabase.appointments.push(appointment);
            mockDatabase.stats.appointments++;
            localStorage.setItem('demoAppointments', JSON.stringify(mockDatabase.appointments));

            showNotification('✅ Cita programada (modo demo)');
            alert(`✅ Consulta programada exitosamente para ${date} a las ${time} (MODO DEMO)`);

        } else if (isOnline && firebaseInitialized) {
            // Verificar si ya existe una cita en esa fecha/hora
            const existingAppointment = await db.collection('appointments')
                .where('date', '==', date)
                .where('time', '==', time)
                .where('status', '==', 'programada')
                .get();

            if (!existingAppointment.empty) {
                alert('⚠️ Ya existe una cita programada para esa fecha y hora.\nPor favor selecciona otro horario.');
                return;
            }

            // Guardar nueva cita en Firebase
            await db.collection('appointments').doc(appointmentId.toString()).set({
                ...appointment,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            await updateSystemStats('appointments');
            showNotification('✅ Cita programada y sincronizada');
            alert(`✅ Consulta programada exitosamente para ${date} a las ${time}`);

        } else {
            // Guardar localmente
            let pendingAppointments = JSON.parse(localStorage.getItem('pendingAppointments') || '[]');
            pendingAppointments.push(appointment);
            localStorage.setItem('pendingAppointments', JSON.stringify(pendingAppointments));

            showNotification('📅 Cita guardada localmente', 'warning');
            alert(`📅 Consulta programada localmente para ${date} a las ${time}\n(Se sincronizará cuando haya conexión)`);
        }

        closeScheduleModal();

        // Limpiar campos del modal
        document.getElementById('consultationDate').value = '';
        document.getElementById('consultationTime').value = '';
        document.getElementById('consultationNotes').value = '';

    } catch (error) {
        console.error('Error programando consulta:', error);

        // Fallback: guardar localmente
        let pendingAppointments = JSON.parse(localStorage.getItem('pendingAppointments') || '[]');
        pendingAppointments.push(appointment);
        localStorage.setItem('pendingAppointments', JSON.stringify(pendingAppointments));

        showNotification('⚠️ Error - cita guardada localmente', 'warning');
        alert(`⚠️ Error de conexión - cita guardada localmente para ${date} a las ${time}`);
        closeScheduleModal();
    }

    updateStats();
}

function sendEmergencyAlert() {
    if (confirm('🚨 ¿Confirmas que esto es una EMERGENCIA MÉDICA?\n\nEsto enviará una alerta inmediata al personal médico.')) {
        const patientName = document.getElementById('patientFullName').value.trim() || 'Paciente sin identificar';
        const symptoms = document.getElementById('symptoms').value.trim() || 'No especificados';

        const emergencyAlert = {
            id: Date.now(),
            type: 'emergency',
            patientName: patientName,
            symptoms: symptoms,
            location: 'Centro de Salud Rural', // Esto debería obtenerse por GPS
            timestamp: new Date().toISOString(),
            status: 'active'
        };

        // En modo demo o si hay problemas de conexión, guardar localmente
        if (DEMO_MODE || !firebaseInitialized) {
            localStorage.setItem('emergencyAlert', JSON.stringify(emergencyAlert));
            showNotification('🚨 ALERTA DE EMERGENCIA ACTIVADA (demo)', 'error');
        } else {
            // En producción, enviar inmediatamente a Firebase con alta prioridad
            db.collection('emergency_alerts').add({
                ...emergencyAlert,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                priority: 'critical'
            }).then(() => {
                showNotification('🚨 ALERTA DE EMERGENCIA ENVIADA', 'error');
            }).catch((error) => {
                console.error('Error enviando alerta:', error);
                localStorage.setItem('emergencyAlert', JSON.stringify(emergencyAlert));
                showNotification('🚨 ALERTA GUARDADA LOCALMENTE', 'error');
            });
        }

        alert('🚨 ALERTA DE EMERGENCIA ACTIVADA\n\nEl personal médico ha sido notificado.\nMantén al paciente estable y espera instrucciones.');
    }
}

// Funciones de sistema
function clearForm() {
    if (confirm('¿Seguro que deseas limpiar el formulario?')) {
        // Limpiar todos los campos
        document.getElementById('patientFullName').value = '';
        document.getElementById('age').value = '';
        document.getElementById('gender').value = '';
        document.getElementById('bloodPressure').value = '';
        document.getElementById('temperature').value = '';
        document.getElementById('heartRate').value = '';
        document.getElementById('oxygenSat').value = '';
        document.getElementById('symptoms').value = '';
        document.getElementById('observations').value = '';
        document.getElementById('urgencyLevel').value = 'baja';

        // Limpiar fotos
        photos = [];
        displayPhotos();

        // Detener cámara si está activa
        stopCamera();

        // Restablecer nombre del paciente
        document.getElementById('patientName').textContent = 'Nuevo Paciente';

        showNotification('🗑️ Formulario limpiado');
    }
}

function toggleDemoMode() {
    const newMode = !DEMO_MODE;
    const message = newMode
        ? '🎭 ¿Activar MODO DEMO?\n\n• Los datos se simularán localmente\n• No se conectará a Firebase\n• Útil para demostraciones'
        : '🌐 ¿Activar MODO REAL?\n\n• Se conectará a Firebase\n• Los datos se guardarán en la nube\n• Requiere conexión a Internet';

    if (confirm(message)) {
        DEMO_MODE = newMode;

        const btn = document.getElementById('demoToggle');
        const banner = document.getElementById('demoBanner');

        if (DEMO_MODE) {
            btn.textContent = '🌐 Activar Modo Real';
            btn.style.background = '#28a745';
            banner.style.display = 'block';
            showNotification('🎭 Modo DEMO activado');
        } else {
            btn.textContent = '🎭 Activar Modo Demo';
            btn.style.background = '#6f42c1';
            banner.style.display = 'none';
            showNotification('🌐 Modo REAL activado');

            // Intentar inicializar Firebase si no está inicializado
            if (!firebaseInitialized) {
                initializeFirebase();
            }
        }

        updateConnectionStatus();
        updateStats();
    }
}

function showSystemStatus() {
    const pendingAppointments = JSON.parse(localStorage.getItem('pendingAppointments') || '[]');
    const emergencyAlert = localStorage.getItem('emergencyAlert');

    const status = `
        🔧 ESTADO DEL SISTEMA DE TELEMEDICINA

        🔥 Firebase:
        ${firebaseInitialized ? '✅ Conectado y funcionando' : '❌ Desconectado o con errores'}

        📱 Modo actual:
        ${DEMO_MODE ? '🎭 DEMO (datos simulados)' : '🌐 REAL (Firebase en vivo)'}

        💾 Almacenamiento local:
        • Consultas pendientes: ${pendingData.length}
        • Citas pendientes: ${pendingAppointments.length}
        • Datos demo: ${DEMO_MODE ? `${mockDatabase.consultations.length} consultas, ${mockDatabase.appointments.length} citas` : 'N/A'}

        🌐 Conexión:
        ${isOnline ? '✅ Conectado a Internet' : '❌ Sin conexión a Internet'}

        🚨 Emergencias:
        ${emergencyAlert ? '⚠️ Hay una alerta de emergencia pendiente' : '✅ Sin alertas activas'}

        📊 Estadísticas de sesión:
        • Fotos tomadas: ${photos.length}
        • Tiempo activo: ${Math.round((Date.now() - window.startTime) / 60000)} minutos

        🔧 Información técnica:
        • Versión del sistema: 2.0.0
        • Navegador: ${navigator.userAgent.split(' ')[0]}
        • Soporte PWA: ${('serviceWorker' in navigator) ? '✅' : '❌'}
        `;

    alert(status);
}

function exportData() {
    const allData = {
        consultations: DEMO_MODE ? mockDatabase.consultations : pendingData,
        appointments: DEMO_MODE ? mockDatabase.appointments : JSON.parse(localStorage.getItem('pendingAppointments') || '[]'),
        emergencyAlerts: localStorage.getItem('emergencyAlert') ? [JSON.parse(localStorage.getItem('emergencyAlert'))] : [],
        exportDate: new Date().toISOString(),
        mode: DEMO_MODE ? 'demo' : 'real'
    };

    const dataStr = JSON.stringify(allData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `telemedicina_export_${new Date().toISOString().split('T')[0]}.json`;
    link.click();

    showNotification('📤 Datos exportados exitosamente');
}

// Event listeners
document.getElementById('patientFullName').addEventListener('input', function () {
    const name = this.value.trim() || 'Nuevo Paciente';
    document.getElementById('patientName').textContent = name;
});

// Event listeners para conectividad
window.addEventListener('online', function () {
    isOnline = true;
    updateConnectionStatus();
    showNotification('🟢 Conexión a Internet restaurada');

    // Intentar reconectar Firebase si no está inicializado
    if (!firebaseInitialized && !DEMO_MODE) {
        setTimeout(initializeFirebase, 2000);
    }

    // Auto-sincronizar si hay datos pendientes
    if (pendingData.length > 0) {
        setTimeout(syncData, 3000);
    }
});

window.addEventListener('offline', function () {
    isOnline = false;
    updateConnectionStatus();
    showNotification('🔴 Sin conexión - trabajando offline', 'warning');
});

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', async function () {
    console.log('🚀 Iniciando Sistema de Telemedicina Rural...');

    firebase.firestore().enableNetwork()
        .then(() => console.log('Online mode enabled'))
        .catch(err => console.log('Error enabling network:', err));

    firebase.firestore().disableNetwork()
        .then(() => console.log('Offline mode enabled'))
        .catch(err => console.log('Error disabling network:', err));

    // Marcar tiempo de inicio
    window.startTime = Date.now();

    // Configurar PWA si está disponible
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('/sw.js');
            console.log('✅ Service Worker registrado');
        } catch (err) {
            console.log('⚠️ Service Worker no disponible:', err);
        }
    }

    // Actualizar interfaz inicial
    updateConnectionStatus();
    updatePendingCount();
    updateStats();

    // Intentar inicializar Firebase (solo si no está en modo demo)
    if (!DEMO_MODE) {
        showNotification('🔗 Conectando a Firebase...');
        const connected = await initializeFirebase();

        if (connected) {
            showNotification('✅ Conectado a Firebase');
        } else {
            showNotification('⚠️ Error conectando - modo offline', 'warning');
        }
    } else {
        showNotification('🎭 Sistema iniciado en modo demo');
    }

    console.log('✅ Sistema de Telemedicina iniciado correctamente');
});

