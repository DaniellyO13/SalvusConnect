// veiculos.js

let vehicles = [];

const vehiclesContainer =
    document.getElementById("vehicles-container");

const emptyState =
    document.getElementById("empty-state");

const vehicleForm =
    document.getElementById("vehicle-form");

const modalVehicle =
    document.getElementById("modal-vehicle");

const modalTitle =
    document.getElementById("modal-title");

const marcaInput =
    document.getElementById("marca");

const modeloInput =
    document.getElementById("modelo");

const anoInput =
    document.getElementById("ano");

const corInput =
    document.getElementById("cor");

const placaInput =
    document.getElementById("placa");


/* =========================================================
   CARREGAR VEÍCULOS
   ========================================================= */

function loadVehicles() {

    const savedVehicles =
        localStorage.getItem("salvusconnect_vehicles");

    vehicles = savedVehicles
        ? JSON.parse(savedVehicles)
        : [];

    renderVehicles();
}


/* =========================================================
   SALVAR VEÍCULOS
   ========================================================= */

function saveVehicles() {

    localStorage.setItem(
        "salvusconnect_vehicles",
        JSON.stringify(vehicles)
    );
}


/* =========================================================
   RENDERIZAR VEÍCULOS
   ========================================================= */

function renderVehicles() {

    if (!vehiclesContainer || !emptyState) {
        return;
    }

    vehiclesContainer.innerHTML = "";

    if (vehicles.length === 0) {

        emptyState.style.display = "flex";
        vehiclesContainer.style.display = "none";

        return;
    }

    emptyState.style.display = "none";
    vehiclesContainer.style.display = "grid";

    vehicles.forEach((vehicle) => {

        const card =
            document.createElement("article");

        card.className = "vehicle-card";

        card.innerHTML = `
            <div class="vehicle-header">

                <div class="vehicle-info">

                    <h3>
                        ${escapeHTML(vehicle.marca)}
                        ${escapeHTML(vehicle.modelo)}
                    </h3>

                    <span class="vehicle-plate">
                        ${escapeHTML(vehicle.placa)}
                    </span>

                </div>

                <button
                    type="button"
                    class="delete-vehicle"
                    data-id="${escapeHTML(vehicle.id)}"
                    title="Excluir veículo"
                >
                    <i data-lucide="trash-2"></i>
                </button>

            </div>

            <div class="vehicle-details">

                <span>
                    ${escapeHTML(String(vehicle.ano))}
                </span>

                ${
                    vehicle.cor
                        ? `
                            <span>
                                ${escapeHTML(vehicle.cor)}
                            </span>
                        `
                        : ""
                }

            </div>
        `;

        vehiclesContainer.appendChild(card);
    });

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    addDeleteEvents();
}


/* =========================================================
   ABRIR MODAL
   ========================================================= */

function openModal() {

    if (!modalVehicle) {
        return;
    }

    modalVehicle.classList.add("active");

    if (modalTitle) {
        modalTitle.textContent = "Novo Veículo";
    }

    setTimeout(() => {

        if (marcaInput) {
            marcaInput.focus();
        }

    }, 100);
}


/* =========================================================
   FECHAR MODAL
   ========================================================= */

function closeModal() {

    if (!modalVehicle) {
        return;
    }

    modalVehicle.classList.remove("active");

    if (vehicleForm) {
        vehicleForm.reset();
    }

}


/* =========================================================
   CADASTRAR VEÍCULO
   ========================================================= */

function handleSaveVehicle(event) {

    event.preventDefault();

    if (
        !marcaInput ||
        !modeloInput ||
        !anoInput ||
        !corInput ||
        !placaInput
    ) {
        return;
    }

    const marca =
        marcaInput.value.trim();

    const modelo =
        modeloInput.value.trim();

    const ano =
        anoInput.value.trim();

    const cor =
        corInput.value.trim();

    const placa =
        placaInput.value.trim().toUpperCase();

    if (!marca || !modelo || !ano || !placa) {
        return;
    }

    const newVehicle = {

        id:
            `vehicle-${Date.now()}`,

        marca,
        modelo,
        ano,
        cor,
        placa

    };

    vehicles.push(newVehicle);

    saveVehicles();

    renderVehicles();

    closeModal();

}


/* =========================================================
   EXCLUIR VEÍCULO
   ========================================================= */

function addDeleteEvents() {

    const deleteButtons =
        document.querySelectorAll(".delete-vehicle");

    deleteButtons.forEach((button) => {

        button.addEventListener("click", () => {

            const vehicleId =
                button.dataset.id;

            vehicles =
                vehicles.filter(
                    (vehicle) =>
                        vehicle.id !== vehicleId
                );

            saveVehicles();

            renderVehicles();

        });

    });

}


/* =========================================================
   FECHAR MODAL CLICANDO FORA
   ========================================================= */

if (modalVehicle) {

    modalVehicle.addEventListener(
        "click",
        (event) => {

            if (
                event.target ===
                modalVehicle
            ) {
                closeModal();
            }

        }
    );

}


/* =========================================================
   TECLA ESC
   ========================================================= */

document.addEventListener(
    "keydown",
    (event) => {

        if (
            event.key === "Escape" &&
            modalVehicle &&
            modalVehicle.classList.contains("active")
        ) {
            closeModal();
        }

    }
);


/* =========================================================
   PLACA EM MAIÚSCULAS
   ========================================================= */

if (placaInput) {

    placaInput.addEventListener(
        "input",
        () => {

            placaInput.value =
                placaInput.value.toUpperCase();

        }
    );

}


/* =========================================================
   SEGURANÇA DO HTML
   ========================================================= */

function escapeHTML(value) {

    const div =
        document.createElement("div");

    div.textContent =
        value ?? "";

    return div.innerHTML;
}


/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

loadVehicles();