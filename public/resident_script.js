// Función para actualizar el reloj
function updateClock() {
    const clock = document.getElementById('clock');
    if (clock) clock.innerText = new Date().toLocaleString();
}
setInterval(updateClock, 1000);

// Función para generar el pase
async function generar() {
    const vName = document.getElementById('vName').value;
    const vDonde = document.getElementById('vDonde').value;
    const isMultiple = document.getElementById('isMultiple').checked;

    if (!vName) {
        alert("Por favor, ingrese el nombre del visitante.");
        return;
    }

    try {
        const response = await fetch(apiUrl('/api/access/generate-manual'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                visitorName: vName, 
                dondeVa: vDonde, 
                isMultiple: isMultiple 
            })
        });

        const data = await response.json();

        if (data.success) {
            // 1. Generar URL del QR (Google Charts API)
            const qrUrl = `https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=${data.token}&choe=UTF-8`;
            
            // 2. Inyectar datos en el Modal
            document.getElementById('qrImg').src = qrUrl;
            document.getElementById('qrToken').innerText = data.token;
            document.getElementById('qrInfo').innerText = `Destino: ${data.dondeVa || 'N/A'}`;
            
            // 3. Configurar WhatsApp
            const text = `*PASE DE ACCESO*%0A*Token:* ${data.token}%0A*Visitante:* ${data.visitorName}%0A*Destino:* ${data.dondeVa || 'N/A'}`;
            document.getElementById('waLink').href = `https://wa.me/?text=${text}`;

            // 4. Mostrar el Modal
            document.getElementById('qrModal').style.display = 'flex';
            
            // 5. Limpiar campos y refrescar tabla
            document.getElementById('vName').value = '';
            document.getElementById('vDonde').value = '';
            actualizarTabla();
        } else {
            alert("Error del servidor: " + data.error);
        }
    } catch (error) {
        console.error("Error:", error);
        alert("No se pudo conectar con el servidor.");
    }
}

// Función para cargar la tabla de pases activos
async function actualizarTabla() {
    try {
        const response = await fetch(apiUrl('/api/access/active'));
        const pases = await response.json();
        const tbody = document.querySelector('#activeTable tbody');
        
        if (!tbody) return;

        tbody.innerHTML = pases.map(p => `
            <tr>
                <td><b>${p.visitorName}</b></td>
                <td>${p.dondeVa || '-'}</td>
                <td>${p.isMultiple ? 'Múltiple' : 'Único'}</td>
                <td>${new Date(p.validUntil).toLocaleString()}</td>
                <td>
                    <button class="btn-del" onclick="borrar('${p.token}')">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error("Error al cargar tabla:", error);
    }
}

// Función para eliminar/cancelar pase
async function borrar(token) {
    if (!confirm("¿Desea cancelar este acceso?")) return;

    try {
        const response = await fetch(apiUrl('/api/access/cancel'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token })
        });

        const data = await response.json();
        if (data.success) {
            actualizarTabla();
        }
    } catch (error) {
        alert("Error al eliminar.");
    }
}

// Función para cerrar modal
function cerrar() {
    document.getElementById('qrModal').style.display = 'none';
}

// Cargar tabla al iniciar la página
document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    actualizarTabla();
});