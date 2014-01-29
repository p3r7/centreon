<?php
/*
 * Copyright 2005-2014 MERETHIS
 * Centreon is developped by : Julien Mathis and Romain Le Merlus under
 * GPL Licence 2.0.
 *
 * This program is free software; you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation ; either version 2 of the License.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
 * PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program; if not, see <http://www.gnu.org/licenses>.
 *
 * Linking this program statically or dynamically with other modules is making a
 * combined work based on this program. Thus, the terms and conditions of the GNU
 * General Public License cover the whole combination.
 *
 * As a special exception, the copyright holders of this program give MERETHIS
 * permission to link this program with independent modules to produce an executable,
 * regardless of the license terms of these independent modules, and to copy and
 * distribute the resulting executable under terms of MERETHIS choice, provided that
 * MERETHIS also meet, for each linked independent module, the terms  and conditions
 * of the license of that module. An independent module is a module which is not
 * derived from this program. If you modify this program, you may extend this
 * exception to your version of the program, but you are not obliged to do so. If you
 * do not wish to do so, delete this exception statement from your version.
 *
 * For more information : contact@centreon.com
 *
 */

namespace Centreon\Repository;

/**
 * @author Lionel Assepo <lassepo@merethis.com>
 * @package Centreon
 * @subpackage Repository
 */
abstract class Repository
{
    /**
     * 
     * @return array
     */
    public static function  getParametersForDatatable()
    {
        return array(
            'column' => static::$datatableColumn,
            'header' => static::$datatableHeader,
            'footer' => static::$datatableFooter
        );
    }
    
    /**
     * 
     * @param array $params
     * @return array
     */
    public static function getDatasForDatatable($params)
    {
        // Init vars
        $additionalTables = '';
        $conditions = '';
        $limitations = '';
        $sort = '';
        
        // Initializing connection
        $di = \Centreon\Core\Di::getDefault();
        $dbconn = $di->get('db_centreon');
        
        // Getting selected field(s)
        $field_list = '';
        foreach (static::$datatableColumn as $field) {
            $field_list .= $field.',';
        }
        $field_list = trim($field_list, ',');

        
        // Getting table column
        $c = array_values(static::$datatableColumn);
        
        // Conditions (Recherche)
        foreach ($params as $paramName=>$paramValue) {
            if (strpos($paramName, 'sSearch_') !== false) {
                if (!empty($paramValue) || $paramValue === "0") {
                    $colNumber = substr($paramName, strlen('sSearch_'));
                    if (empty($conditions)) {
                        $conditions = "WHERE ".$c[$colNumber]." like '%".$paramValue."%' ";
                    } else {
                        $conditions .= "AND ".$c[$colNumber]." like '%".$paramValue."%' ";
                    }
                }
            }
        }
        
        // Sort
        $sort = 'ORDER BY '.$c[$params['iSortCol_0']].' '.$params['sSortDir_0'];
        
        // Processing the limit
        $limitations = 'LIMIT '.$params['iDisplayStart'].','.$params['iDisplayLength'];
        
        // Building the final request
        $finalRequest = "SELECT $field_list FROM ".static::$tableName." $additionalTables $conditions $sort $limitations";
        
        try {
            // Executing the request
            $stmt = $dbconn->query($finalRequest);
        } catch (Exception $e) {
            
        }
        
        // Returning the result
        $resultSet = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $countTab = count($resultSet);
        $objectTab = array();
        for($i=0; $i<$countTab; $i++) {
            $objectTab[] = static::$objectName;
        }
        return self::array_values_recursive(
            \array_values(
                \array_map(
                    "\\Centreon\\Core\\Datatable::castResult",
                    $resultSet,
                    $objectTab
                )
            )
        );
    }
    
    /**
     * 
     * @param array $params
     * @return array
     */
    public static function getCustomDatas($params)
    {
       
    }
    
    /**
     * 
     * @param array $params
     * @return array
     */
    public static function getTotalRecordsForDatatable($params)
    {
        // Initializing connection
        $di = \Centreon\Core\Di::getDefault();
        $dbconn = $di->get('db_centreon');
        
        $conditions = '';
        $sort = '';
        
        $tbName = static::$tableName;
        
        // Getting table column
        $c = array_values(static::$datatableColumn);
        
        // Conditions (Recherche)
        foreach ($params as $paramName=>$paramValue) {
            if (strpos($paramName, 'sSearch_') !== false) {
                if (!empty($paramValue) || $paramValue === "0") {
                    $colNumber = substr($paramName, strlen('sSearch_'));
                    if (empty($conditions)) {
                        $conditions = "WHERE ".$c[$colNumber]." like '%".$paramValue."%' ";
                    } else {
                        $conditions .= "AND ".$c[$colNumber]." like '%".$paramValue."%' ";
                    }
                }
            }
        }
        
        // Sort
        $sort = 'ORDER BY '.$c[$params['iSortCol_0']].' '.$params['sSortDir_0'];
        
        // Building the final request
        $request = "SELECT COUNT('id') as nb".ucwords(static::$tableName).
            " FROM ".static::$tableName." $conditions $sort";
        
        // Executing the request
        $stmt = $dbconn->query($request);
        
        // Getting the result
        $result = $stmt->fetchAll();
        
        // Returing the result
        return $result[0]['nb'.ucwords(static::$tableName)];
    }
    
    public static function castColumn($element)
    {
        $elementField = array_keys($element);
        $originalElement = $element;
        foreach (static::$columnCast as $castField=>$castValues) {
            if (is_array($castValues)) {
                if (\in_array($castField, $elementField)) {
                    $element[$castField] = $castValues[$element[$castField]];
                }
            } else {
                $castedElement = \array_map(function($n) {return "::$n::";}, $elementField);
                $element[$castField] = str_replace($castedElement, $originalElement, $castValues);
            }
        }
        return $element;
    }
    
    /**
     * 
     * @param type $array
     * @return type
     */
    public static function array_values_recursive($array)
    {
        $array = array_values( $array );
        for ( $i = 0, $n = count( $array ); $i < $n; $i++ ) {
            $element = $array[$i];
            if ( is_array( $element ) ) {
                $array[$i] = self::array_values_recursive( $element );
            }
        }
        return $array;
    }
    
    /**
     * 
     * @param array $params
     */
    public static function getTotalRecords($params)
    {
        
    }
}
