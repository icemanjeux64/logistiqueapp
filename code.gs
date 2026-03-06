function doGet(e) {
  return handleRequest('GET', e);
}

function doPost(e) {
  return handleRequest('POST', e);
}

function handleRequest(method, e) {
  // Plus besoin de l'ID si le script est rattaché au tableau (Extensions > Apps Script depuis le tableau)
  // Nom de l'onglet précis où se trouve ton tableau (ex: "Tableau de Bord")
  const SHEET_NAME = 'Tableau de Bord'; 
  
  // Headers CORS pour permettre à l'application web (n'importe où) de communiquer
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  
  try {
    const spreadSheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadSheet) {
      throw new Error("Impossible de lier le tableau. Le script est-il bien créé depuis la feuille de calcul ?");
    }
    
    const sheet = spreadSheet.getSheetByName(SHEET_NAME);
    if (!sheet) {
      throw new Error("Onglet '" + SHEET_NAME + "' introuvable. Vérifie le nom en bas de la feuille Google Sheet.");
    }

    if (method === 'GET') {
      // GET : Récupérer toutes les données du véhicule
      const data = getVehiclesData(sheet);
      return output.setContent(JSON.stringify({
        status: 'success',
        data: data
      }));
      
    } else if (method === 'POST') {
      // POST : Mettre à jour une ou plusieurs lignes
      // Le payload doit être envoyé en string JSON : { action: "update", vehicle: { id: 2, deployed: 1, status: "Opérationnel", ...} }
      
      let payload;
      if (e.postData && e.postData.contents) {
         payload = JSON.parse(e.postData.contents);
      } else {
         payload = JSON.parse(e.parameter.data); // Fallback depending on how fetch is made
      }
      
      if (payload.action === 'update' && payload.vehicle) {
        const result = updateVehicleRow(sheet, payload.vehicle);
        return output.setContent(JSON.stringify({
          status: 'success',
          message: 'Véhicule mis à jour',
          updated_row: result
        }));
      } else if (payload.action === 'shift_log') {
        const result = updateShiftLog(sheet, payload.data);
        return output.setContent(JSON.stringify({
          status: 'success',
          message: 'Service mis à jour',
          data: result
        }));
      } else {
         throw new Error("Action ou donnees manquantes dans le POST.");
      }
    }

  } catch (error) {
    return output.setContent(JSON.stringify({
      status: 'error',
      message: error.toString()
    }));
  }
}

// --- Fonctions d'extraction et de manipulation métier ---

function getVehiclesData(sheet) {
  // ADAPTER LES PLAGES EN FONCTION DE LA VRAIE STRUCTURE DU SHEET
  // On suppose que la ligne 7 contient les entêtes et les données commencent ligne 8
  const startRow = 8;
  const lastRow = sheet.getLastRow();
  
  // Si le tableau s'arrête avant la fin de la feuille, ou pour éviter les lignes vides :
  if(lastRow < startRow) return [];
  
  const numRows = lastRow - startRow + 1;
  // A to K (colonnes 1 à 11) - Adapter selon la capture
  const numColumns = 11; 
  
  const range = sheet.getRange(startRow, 1, numRows, numColumns);
  const values = range.getValues();
  
  let vehicles = [];
  
  // Indexation des colonnes (A adapter selon ton Google Sheet précis)
  // 0: Grade, 1: Categorie, 2: Type, 3: Deployés, 4: Date, 5: Cout, 6: Statut, 7: Detruits, 8: Equipage, 9: Event, 10: Remarques
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const categoryName = String(row[1]).trim();
    const vehicleName = String(row[2]).trim();
    
    // Ignorer les lignes totalement vides ou les séparateurs
    if (!categoryName && !vehicleName) continue;
    
    vehicles.push({
      id: startRow + i, // L'ID est la ligne physique dans le tableur (pratique pour l'update)
      grade: row[0],
      category: categoryName,
      name: vehicleName,
      deployed: Number(row[3]) || 0,
      cost: Number(row[5]) || 0,
      status: String(row[6]) || "Pas déployé",
      destroyed: Number(row[7]) || 0,
      crew: String(row[8] || ""),
      note: String(row[10] || "")
    });
  }
  
  return vehicles;
}

function updateVehicleRow(sheet, vehicleData) {
  // L'ID du véhicule correspond à sa ligne physique dans le tableau
  const rowIndex = vehicleData.id;
  
  if(!rowIndex || rowIndex < 8) {
    throw new Error("ID (ligne) de véhicule invalide.");
  }
  
  // Attention à la position des colonnes (Base 1 pour getRange)
  // Colonne 4 : Déployés
  sheet.getRange(rowIndex, 4).setValue(vehicleData.deployed);
  
  // Colonne 7 : Statut
  sheet.getRange(rowIndex, 7).setValue(vehicleData.status);
  
  // Colonne 9 : Équipage
  sheet.getRange(rowIndex, 9).setValue(vehicleData.crew);
  
  // (Optionnel) Colonne 8 : Détruit
  if(vehicleData.destroyed !== undefined) {
      sheet.getRange(rowIndex, 8).setValue(vehicleData.destroyed);
  }
  
  return rowIndex;
}

function updateShiftLog(sheet, logData) {
  // G4 (Col 7, Row 4): SL Name
  // H4 (Col 8, Row 4): Start Time
  // I4 (Col 9, Row 4): End Time
  
  if (logData.slName !== undefined) {
    sheet.getRange(4, 7).setValue(logData.slName);
  }
  
  if (logData.startTime !== undefined) {
    sheet.getRange(4, 8).setValue(logData.startTime);
  }
  
  if (logData.endTime !== undefined) {
    sheet.getRange(4, 9).setValue(logData.endTime);
  }
  
  return logData;
}

// Fonction de test depuis l'éditeur App Script
function testGet() {
  const SPREADSHEET_ID = 'A_REMPLACER'; 
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();
  const res = getVehiclesData(sheet);
  Logger.log(JSON.stringify(res, null, 2));
}
